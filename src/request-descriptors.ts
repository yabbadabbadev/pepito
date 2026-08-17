/**
 * Cómo se compara la petición esperada contra la observada. `searchParams` y
 * `body` casan por subconjunto de claves de primer nivel con igualdad
 * profunda por clave — `{ body: { productName: 'Leche' } }` casa aunque la
 * petición real lleve además `id` o `createdAt` — salvo `exact: true`, que
 * exige igualdad estricta de todo el objeto.
 *
 * Una clave repetida en la query real (`?tag=a&tag=b`) se colapsa a un único
 * valor —el último— antes de comparar, porque el registro construye
 * `searchParams` con `Object.fromEntries`: si tu aplicación depende de que una
 * clave aparezca más de una vez, esta comparación no lo detecta.
 */
export interface RequestSpecOptions {
  searchParams?: Record<string, string>
  body?: unknown
  exact?: boolean
}

/**
 * Describe la petición que un matcher de red busca en el tráfico observado.
 * Se construye con `request()` o alguno de sus atajos (`get`, `post`, `put`,
 * `patch`, `del`, `query`); no hace falta construirlo a mano.
 *
 * El matching ignora el `origin`: `get('/api/x')` casa tanto contra una
 * petición same-origin a `/api/x` como contra `https://otro.host/api/x`, si
 * algún handler responde ahí. El registro de tráfico sí guarda el `origin` de
 * cada petición — no se usa todavía, pero deja sitio para una aserción por
 * host el día que dos hosts compartan un mismo path.
 */
export interface RequestSpec extends RequestSpecOptions {
  method: string
  path: string
}

/**
 * Escotilla para cualquier método HTTP, incluidos los que MSW 2.15 todavía no
 * expone como helper propio (`QUERY`). Los atajos (`get`, `post`, …) son
 * `request(métodoFijo, ...)`; para el resto de métodos, o para dejar el
 * método explícito en el propio test, se usa directamente.
 *
 * @example
 * ```ts
 * import { request } from '@yabbadabbadev/pepito'
 *
 * await expect(request('QUERY', '/api/products')).toHaveBeenRequested()
 * ```
 */
export function request(
  method: string,
  path: string,
  options?: RequestSpecOptions,
): RequestSpec {
  return { method, path, ...options }
}

/**
 * Describe una petición `GET` esperada.
 *
 * @example
 * ```ts
 * import { get } from '@yabbadabbadev/pepito'
 *
 * await expect(get('/api/products', { searchParams: { filtro: 'pan' } })).toHaveBeenRequested()
 * ```
 */
export const get: (
  path: string,
  options?: RequestSpecOptions,
) => RequestSpec = (path, options) => request('GET', path, options)

/** Describe una petición `POST` esperada; misma forma que {@link get}. */
export const post: typeof get = (path, options) =>
  request('POST', path, options)

/** Describe una petición `PUT` esperada; misma forma que {@link get}. */
export const put: typeof get = (path, options) => request('PUT', path, options)

/** Describe una petición `PATCH` esperada; misma forma que {@link get}. */
export const patch: typeof get = (path, options) =>
  request('PATCH', path, options)

/**
 * Describe una petición `DELETE` esperada; misma forma que {@link get}.
 * Se llama `del` porque `delete` es palabra reservada.
 */
export const del: typeof get = (path, options) =>
  request('DELETE', path, options)

/**
 * Describe una petición `QUERY` esperada — el método que introduce el spec de
 * este paquete, entre `GET` y `POST`. La opción relevante suele ser
 * `searchParams`, no `body`: se llama `searchParams` y no `query` a propósito,
 * porque `query` ya es el nombre de este método HTTP en la misma API. MSW
 * 2.15 no expone `query` como helper de handler todavía — se declara con
 * `http.all` y se filtra por método — pero el registro de tráfico de pepito
 * lo observa igual, porque lee `request.method` como cadena.
 */
export const query: typeof get = (path, options) =>
  request('QUERY', path, options)
