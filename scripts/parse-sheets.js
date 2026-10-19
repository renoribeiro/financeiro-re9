import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const baseDir = 'docs/migracao/extracted/xl'
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

// 1. Read shared strings
let sharedStrings = []
if (fs.existsSync(path.join(baseDir, 'sharedStrings.xml'))) {
  const ssXml = parser.parse(fs.readFileSync(path.join(baseDir, 'sharedStrings.xml'), 'utf8'))
  const siList = ssXml.sst.si
  const items = Array.isArray(siList) ? siList : [siList]

  sharedStrings = items.map(si => {
    if (!si)
      return ''
    if (typeof si.t === 'string')
      return si.t
    if (typeof si.t === 'number')
      return String(si.t)
    if (si.t && si.t['#text'])
      return si.t['#text']
    if (si.r) {
      const runs = Array.isArray(si.r) ? si.r : [si.r]

      return runs.map(r => typeof r.t === 'string' ? r.t : (r.t ? r.t['#text'] || '' : '')).join('')
    }

    return ''
  })
}

// 2. Read sheet relationships
const relsXml = parser.parse(fs.readFileSync(path.join(baseDir, '_rels/workbook.xml.rels'), 'utf8'))
const rels = relsXml.Relationships.Relationship
const relMap = new Map()
const relArr = Array.isArray(rels) ? rels : [rels]

relArr.forEach(r => relMap.set(r['@_Id'], r['@_Target']))

// 3. Read workbook sheet metadata
const wbXml = parser.parse(fs.readFileSync(path.join(baseDir, 'workbook.xml'), 'utf8'))
const sheetsMeta = wbXml.workbook.sheets.sheet
const sheetList = Array.isArray(sheetsMeta) ? sheetsMeta : [sheetsMeta]

function colToIdx(colStr) {
  let num = 0
  for (let i = 0; i < colStr.length; i++)
    num = num * 26 + (colStr.charCodeAt(i) - 64)

  return num - 1
}

function parseCellRef(ref) {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match)
    return { col: 0, row: 0 }

  return { col: colToIdx(match[1]), row: Number.parseInt(match[2], 10) }
}

const parsedSheets = {}

sheetList.forEach(s => {
  const name = s['@_name']
  const rId = s['@_r:id']
  const target = relMap.get(rId)
  if (!target)
    return

  const sheetPath = path.join(baseDir, target.replace('/', path.sep))
  if (!fs.existsSync(sheetPath))
    return

  const sheetXml = parser.parse(fs.readFileSync(sheetPath, 'utf8'))
  const sheetData = sheetXml.worksheet.sheetData
  if (!sheetData || !sheetData.row) {
    parsedSheets[name] = []

    return
  }

  const rowList = Array.isArray(sheetData.row) ? sheetData.row : [sheetData.row]
  const rowsMatrix = []

  rowList.forEach(r => {
    const rowIdx = Number.parseInt(r['@_r'], 10) - 1
    const cellList = r.c ? (Array.isArray(r.c) ? r.c : [r.c]) : []
    const rowCells = []

    cellList.forEach(c => {
      const ref = c['@_r']
      const { col } = parseCellRef(ref)
      const type = c['@_t']
      let val = c.v !== undefined ? c.v : (c.f ? c.f : '')

      if (type === 's' && typeof val === 'number')
        val = sharedStrings[val] ?? val
      else if (type === 's' && typeof val === 'string' && !isNaN(Number(val)))
        val = sharedStrings[Number.parseInt(val, 10)] ?? val

      rowCells[col] = val
    })

    rowsMatrix[rowIdx] = rowCells
  })

  parsedSheets[name] = rowsMatrix
})

fs.writeFileSync('docs/migracao/parsed_sheets.json', JSON.stringify(parsedSheets, null, 2))
console.log('Sheets parsed successfully! Keys:', Object.keys(parsedSheets))
