// ============================================================================
// Protege formulários contra perda acidental do que foi digitado: ao fechar um
// diálogo com alterações, pede confirmação antes de descartar.
//
// Uso:
//   const guard = useDiscardGuard(() => form.value)
//   // ao abrir o diálogo:      guard.arm()
//   // botão Cancelar/fechar:   guard.requestClose(() => { dialog.value = false })
//   // no template:             <ConfirmDialog v-model="guard.prompt.value" v-bind="guard.dialogProps" :action="guard.discard" />
// ============================================================================

export function useDiscardGuard(getState: () => unknown) {
  const snapshot = ref('')
  const prompt = ref(false)
  let pendingClose: (() => void) | null = null

  const serialize = () => {
    try {
      return JSON.stringify(getState() ?? null)
    }
    catch {
      return ''
    }
  }

  /** Registra o estado inicial do formulário (chamar ao abrir o diálogo). */
  function arm() {
    snapshot.value = serialize()
  }

  const isDirty = () => serialize() !== snapshot.value

  /** Fecha direto se nada mudou; senão pergunta antes de descartar. */
  function requestClose(close: () => void) {
    if (!isDirty()) {
      close()

      return
    }
    pendingClose = close
    prompt.value = true
  }

  function discard() {
    const close = pendingClose

    pendingClose = null
    close?.()
  }

  const dialogProps = {
    title: 'Descartar alterações?',
    message: 'Você alterou este formulário. Se fechar agora, o que foi digitado será perdido.',
    confirmText: 'Descartar',
    confirmColor: 'error',
    cancelText: 'Continuar editando',
  }

  return { arm, isDirty, requestClose, discard, prompt, dialogProps }
}
