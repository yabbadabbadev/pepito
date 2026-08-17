/**
 * Limpia el almacenamiento de origen que browser mode filtra entre los
 * ficheros de test que caen en el mismo worker: `localStorage`,
 * `sessionStorage` y cookies pertenecen al origen, no al documento, así que
 * sobreviven al aislamiento por fichero (docs/knowledge/aislamiento-tests.md).
 *
 * Cada cookie se expira dos veces por nombre: una con `path=/` (la que fija
 * la mayoría del código de aplicación) y otra sin atributo `path`, por si
 * alguna se fijó sin uno. `setupNetwork()` llama a esta función ANTES de
 * restaurar la URL en su `afterEach`, como orden defensivo: por RFC 6265, el
 * `path` por defecto de una cookie sin atributo se calcula, en teoría, a
 * partir de la URL activa al fijarla y al borrarla, así que borrar antes de
 * restaurar la URL sería lo correcto SI ese cálculo siguiera las rutas que
 * `setupNetwork()` simula con `history.pushState`.
 *
 * Medido que no es así en este arnés (Chromium vía Playwright,
 * `vitest@4.1.10`): el orden no tiene ningún efecto observable hoy —
 * evidencia completa en docs/knowledge/url-navegacion-browser-mode.md. Se
 * mantiene el orden de todos modos, sin coste, por si un runner o navegador
 * futuro sí sigue la URL simulada.
 *
 * Límite conocido y sí verificado: una cookie fijada con `path` explícito o
 * con `domain` no se puede ni enumerar desde `document.cookie` — sigue viva
 * después de esta llamada.
 *
 * @example
 * ```ts
 * afterEach(() => {
 *   clearOriginStorage()
 * })
 * ```
 */
export function clearOriginStorage(): void {
  localStorage.clear()
  sessionStorage.clear()

  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (!name) continue
    document.cookie = `${name}=;expires=${new Date(0).toUTCString()};path=/`
    document.cookie = `${name}=;expires=${new Date(0).toUTCString()}`
  }
}
