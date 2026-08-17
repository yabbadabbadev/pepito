import type { SetupWorker } from 'msw/browser'

/** Lo que `mount` necesita de `setupNetwork()`: el worker donde registrar handlers de test y el `href` original que restaurar entre tests. */
export interface NetworkContext {
  worker: SetupWorker
  initialHref: string
}

// Módulo por fichero de test en browser mode (docs/knowledge/aislamiento-tests.md):
// esta variable no fuga entre ficheros, así que un fichero que nunca llama a
// setupNetwork ve siempre `undefined` aquí, sin necesitar un reset explícito.
let context: NetworkContext | undefined

/** Publica el contexto de `setupNetwork()` para que `mount` lo lea; una llamada por fichero de test. */
export function registerNetworkContext(nextContext: NetworkContext): void {
  context = nextContext
}

/** Lee el contexto publicado o lanza con instrucción si `setupNetwork()` no se llamó antes que `caller`. */
export function requireNetworkContext(caller: string): NetworkContext {
  if (!context) {
    throw new Error(
      `pepito: setupNetwork(handlers) no se ha inicializado. Llámalo en tu fichero de setup (setupFiles de vitest.config) antes de usar ${caller}.`,
    )
  }
  return context
}
