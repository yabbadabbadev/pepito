import { formatTraffic } from './failure-messages'
// Ciclo con matchers.ts (que importa NETWORK_TARGET de este fichero, más
// abajo): seguro porque los dos usos viven dentro de cuerpos de función que
// se ejecutan diferidos, nunca en la evaluación de módulo — la elevación de
// `import`/`function` los resuelve a tiempo de llamada. Cambiar cualquiera de
// los dos lados a una const-arrow de nivel de módulo rompería el ciclo, con
// uno de los dos lados viendo `undefined` al cargar.
import { snapshotAfterIdle } from './matchers'

/**
 * Marcador opaco sobre el que cuelga `expect.network()`. No identifica una
 * petición sino el tráfico global observado por el registro: un símbolo
 * evita que cualquier valor real de la aplicación (un string, un objeto de
 * spec) pueda colarse por error donde solo tiene sentido este marcador —
 * `toHaveNoUnhandledRequests` lo exige con `===` antes de mirar el tráfico.
 */
export const NETWORK_TARGET: unique symbol = Symbol('pepito:network-target')

/**
 * Utilidades de diagnóstico sobre el tráfico observado, para inspeccionarlo
 * fuera de una aserción (por ejemplo, al depurar un test que falla).
 */
export const network = {
  /**
   * Espera a que la red se calme y vuelca el tráfico observado por
   * `console.log`, con el mismo formato que aparece en los mensajes de fallo
   * de los matchers de red.
   *
   * @example
   * ```ts
   * await fetch('/api/products')
   * await network.log()
   * ```
   */
  async log(): Promise<void> {
    const traffic = await snapshotAfterIdle()
    console.log(formatTraffic(traffic))
  },

  /**
   * Espera a que la red se calme, con el mismo mecanismo de doble
   * observación que usan los matchers de red (`snapshotAfterIdle` en
   * matchers.ts) — no lo duplica, solo descarta el snapshot que produce.
   * Garantiza que toda petición vista hasta el momento de la llamada ha
   * cerrado (con `response:mocked`, `response:bypass` o el 500 que MSW
   * fabrica ante un handler que lanza). No garantiza ausencia de tráfico
   * futuro: queda la misma ventana ciega práctica que el resto del
   * mecanismo — una petición lanzada en el mismo tick que la llamada, antes
   * de cruzar la vuelta real al service worker (1–6 ms medidos en
   * `docs/knowledge/quiescencia-red-msw.md`), puede no estar todavía en el
   * registro cuando `network.idle()` resuelve.
   *
   * Pensado para regresión visual: capturar nada más montar, con una red
   * lenta de por medio, produce una baseline ESTABLE pero equivocada — el
   * estabilizador nativo de `toMatchScreenshot` no lo detecta porque
   * «Cargando…» también es una captura que deja de cambiar entre frames
   * (`docs/knowledge/regresion-visual-browser-mode.md`: 0 fallos en 17
   * ejecuciones locales + 3 en CI esperando la calma así). Antes de esto,
   * la única forma pública de esperar la calma sin más era desviar
   * `expect.network().toHaveNoUnhandledRequests()` de su propósito real
   * (detectar tráfico sin handler). Sirve igual como «espera a que la red
   * se calme» genérico, sin asertar nada.
   *
   * @example
   * ```ts
   * const screen = await mount(<App />)
   * await network.idle()
   * await expect.element(screen.getByRole('main')).toMatchScreenshot('catalogo')
   * ```
   *
   * @throws Si la red no se calma dentro del presupuesto de
   * `QUIESCENCE_TIMEOUT_MS`, con el volcado de las peticiones que seguían en
   * vuelo — el mismo error que lanza `waitForNetworkIdle`.
   */
  async idle(): Promise<void> {
    await snapshotAfterIdle()
  },
}
