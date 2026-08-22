import { randomUUID } from 'node:crypto'
import { readMultipartFormData } from 'h3'
import { requireCompanyRole } from '../../utils/security'
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_BUCKET,
  ENTITY_TABLES,
  MAX_ATTACHMENT_BYTES,
  attachmentReference,
  decryptSecret,
  driveRequest,
  findOrCreateDriveFolder,
  getStorageSettings,
  googleToken,
  sha256,
} from '../../utils/storage'

export default defineEventHandler(async event => {
  const parts = await readMultipartFormData(event)
  const value = (name: string) => parts?.find(part => part.name === name)?.data.toString('utf8')
  const file = parts?.find(part => part.name === 'file' && part.filename)
  const companyId = value('companyId')
  const entityType = value('entityType') as keyof typeof ENTITY_TABLES
  const entityId = value('entityId')
  if (!companyId || !entityId || !ENTITY_TABLES[entityType] || !file?.filename)
    throw createError({ statusCode: 400, message: 'Dados do anexo incompletos.' })
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type || '') || file.data.length > MAX_ATTACHMENT_BYTES)
    throw createError({ statusCode: 415, message: 'Envie PDF, PNG ou JPEG com no máximo 10 MB.' })
  const { user } = await requireCompanyRole(event, companyId, ['super_admin', 'admin', 'financial'])
  const { service, settings } = await getStorageSettings(event, companyId)
  const { data: entity } = await service.from(ENTITY_TABLES[entityType]).select('id').eq('id', entityId).eq('company_id', companyId).maybeSingle()
  if (!entity)
    throw createError({ statusCode: 404, message: 'O registro vinculado ao anexo não foi encontrado.' })

  const common = {
    id: randomUUID(),
    company_id: companyId,
    entity_type: entityType,
    entity_id: entityId,
    original_name: file.filename,
    mime_type: file.type,
    size_bytes: file.data.length,
    sha256: sha256(file.data),
    uploaded_by: user.id,
  }

  let metadata: Record<string, unknown>
  let uploadedDriveFileId: string | undefined
  let uploadedInternalPath: string | undefined
  let driveAccessToken: string | undefined

  if (settings?.active_provider === 'google_drive') {
    const accessToken = await googleToken(decryptSecret(settings.google_refresh_token_ciphertext))

    driveAccessToken = accessToken

    const companyFolder = await findOrCreateDriveFolder(accessToken, companyId, settings.google_root_folder_id)
    const entityFolder = await findOrCreateDriveFolder(accessToken, entityType, companyFolder)
    const recordFolder = await findOrCreateDriveFolder(accessToken, entityId, entityFolder)
    const form = new FormData()
    const fileArrayBuffer = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength) as ArrayBuffer

    form.append('metadata', new Blob([JSON.stringify({ name: file.filename, parents: [recordFolder] })], { type: 'application/json' }))
    form.append('file', new Blob([fileArrayBuffer], { type: file.type }), file.filename)

    const response = await driveRequest<{ id: string }>(
      accessToken,
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', body: form },
    )

    const uploaded = await response.json()

    uploadedDriveFileId = uploaded.id
    metadata = { ...common, provider: 'google_drive', bucket_id: null, object_path: null, external_file_id: uploaded.id, external_parent_id: recordFolder }
  }
  else {
    const extension = file.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const objectPath = `${companyId}/${String(entityType)}/${entityId}/${common.id}.${extension}`
    const { error: uploadError } = await service.storage.from(ATTACHMENT_BUCKET).upload(objectPath, file.data, { contentType: file.type, upsert: false })
    if (uploadError) {
      console.error('[storage/upload] Falha no armazenamento interno.', {
        companyId,
        entityType,
        entityId,
        code: uploadError.name,
        message: uploadError.message,
      })
      throw createError({ statusCode: 500, message: 'Não foi possível armazenar o arquivo.' })
    }

    uploadedInternalPath = objectPath
    metadata = { ...common, provider: 'internal', bucket_id: ATTACHMENT_BUCKET, object_path: objectPath }
  }
  const { data: attachment, error } = await service.from('attachments').insert(metadata).select('id, original_name, provider').single()
  if (error) {
    console.error('[storage/upload] Falha ao persistir os metadados.', {
      companyId,
      entityType,
      entityId,
      code: error.code,
      message: error.message,
    })
    if (uploadedInternalPath)
      await service.storage.from(ATTACHMENT_BUCKET).remove([uploadedInternalPath])
    if (uploadedDriveFileId && driveAccessToken) {
      try {
        await driveRequest(driveAccessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadedDriveFileId)}`, { method: 'DELETE' })
      }
      catch {
        // Metadata persistence is the primary error; remote cleanup is best effort.
      }
    }
    throw createError({ statusCode: 500, message: 'O arquivo foi enviado, mas seu registro não pôde ser criado.' })
  }

  return { ...attachment, reference: attachmentReference(attachment.id) }
})
