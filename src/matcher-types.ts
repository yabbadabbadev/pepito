/**
 * Lo que se espera que haya respondido un handler, para `toHaveRespondedWith`.
 * `status` es obligatorio; `body` se compara por subconjunto de claves de
 * primer nivel salvo `exact: true`, que exige igualdad estricta — misma
 * semántica que `RequestSpecOptions.body` en request-descriptors.ts, pero
 * sobre la respuesta en vez de sobre la petición.
 */
export interface ExpectedResponse {
  status: number
  body?: unknown
  exact?: boolean
}

interface NetworkMatchers<ReturnType = unknown> {
  /**
   * Comprueba que la aplicación hizo una petición que casa con `spec`, por
   * `method` y `path` exactos y `searchParams`/`body` por subconjunto.
   * Reintenta hasta encontrarla o agotar el timeout: una petición es un
   * efecto posterior a la interacción, igual que `expect.element`.
   *
   * `.not.toHaveBeenRequested()` no reintenta: espera primero a que la red se
   * calme, para no confundir una petición que aún no llegó con una que nunca
   * se hizo.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products')
   * await expect(get('/api/products')).toHaveBeenRequested()
   * await expect(get('/api/other')).not.toHaveBeenRequested()
   * ```
   */
  toHaveBeenRequested(): Promise<ReturnType>

  /**
   * Comprueba que se hicieron exactamente `count` peticiones que casan con
   * `spec`. Siempre espera a que la red se calme antes de contar, con o sin
   * `.not`: un conteo tomado a mitad de tráfico es tan falso como una
   * ausencia tomada a mitad de tráfico.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await Promise.all([fetch('/api/products'), fetch('/api/products')])
   * await expect(get('/api/products')).toHaveBeenRequestedTimes(2)
   * ```
   */
  toHaveBeenRequestedTimes(count: number): Promise<ReturnType>

  /**
   * Comprueba que un handler propio produjo la respuesta, no solo que la
   * petición coincidió con su ruta: un handler con `passthrough()` cumple
   * `toHaveBeenRequested` pero no este matcher, porque la respuesta vino de
   * la red real.
   *
   * @example
   * ```ts
   * import { post } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products', { method: 'POST' })
   * await expect(post('/api/products')).toHaveBeenIntercepted()
   * ```
   */
  toHaveBeenIntercepted(): Promise<ReturnType>

  /**
   * Comprueba que la petición fue interceptada (como `toHaveBeenIntercepted`)
   * y que la respuesta tiene el `status` esperado y, si se da, un `body` que
   * case por subconjunto. `toHaveRespondedWith(500)` es el atajo de
   * `toHaveRespondedWith({ status: 500 })`.
   *
   * @example
   * ```ts
   * import { get } from '@yabbadabbadev/pepito'
   *
   * await fetch('/api/products')
   * await expect(get('/api/products')).toHaveRespondedWith({
   *   status: 200,
   *   body: { total: 2 },
   * })
   * ```
   */
  toHaveRespondedWith(expected: number | ExpectedResponse): Promise<ReturnType>

  /**
   * Guardarraíl de suite: comprueba que ninguna petición se quedó sin
   * handler. No describe una petición concreta, así que cuelga de
   * `expect.network()` en vez de un descriptor de `get`/`post`/…; usarlo
   * sobre otra cosa falla con instrucción, no con un veredicto de datos.
   *
   * @example
   * ```ts
   * await expect.network().toHaveNoUnhandledRequests()
   * ```
   */
  toHaveNoUnhandledRequests(): Promise<ReturnType>
}

// Augmenta '@vitest/expect', no 'vitest': en esta versión (vitest@4.1.10),
// declare module 'vitest' compila sin error pero la fusión con `Assertion` no
// llega a aplicarse (el propio `Assertion<T>` de la llamada global queda sin
// los métodos nuevos). El propio paquete vitest amplía sus tipos globales
// contra '@vitest/expect' directamente (ver
// node_modules/vitest/dist/chunks/global.d.*.d.ts) — mismo patrón, verificado
// aquí porque el spike (que sí usa 'vitest') no reproduce el fallo. Detalle en
// docs/knowledge/augmentacion-tipos-vitest-expect.md.
declare module '@vitest/expect' {
  // Interfaces vacías: es el mecanismo de la augmentación de módulos, no un
  // descuido (mismo criterio que el bloque `**/*.d.ts` de eslint.config.js,
  // que no cubre este fichero por no ser `.d.ts`).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends NetworkMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends NetworkMatchers {}
  interface ExpectStatic {
    /**
     * Punto de entrada para aserciones sobre la red en conjunto, no sobre una
     * petición concreta. Hoy solo lo consume `toHaveNoUnhandledRequests`.
     *
     * @example
     * ```ts
     * await expect.network().toHaveNoUnhandledRequests()
     * ```
     */
    network(): Assertion<unknown>
  }
}
