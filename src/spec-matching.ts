import type { RequestSpec } from './request-descriptors'
import type { ResolvedRequest } from './traffic-registry'

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}

// Excluye null (typeof null === 'object') y arrays: unos y otros casan por
// igualdad profunda directa, no por subconjunto de claves.
function isPlainObject(
  candidate: unknown,
): candidate is Record<string, unknown> {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate)
  )
}

function matchesSubset(
  observed: Record<string, unknown>,
  expected: Record<string, unknown>,
  exact: boolean | undefined,
): boolean {
  if (exact) return deepEqual(observed, expected)
  return Object.keys(expected).every((key) =>
    deepEqual(observed[key], expected[key]),
  )
}

/**
 * Compara un valor observado contra uno esperado por subconjunto de claves de
 * primer nivel con igualdad profunda por clave (o igualdad profunda directa si
 * `expected` no es un objeto plano), salvo `exact: true`, que exige igualdad
 * estricta de todo el objeto. La usan tanto `matchesSpec` sobre el `body` de
 * la petición como `toHaveRespondedWith` sobre el `responseBody`: misma
 * semántica de subconjunto, dos sitios distintos donde se aplica.
 */
export function matchesBody(
  observed: unknown,
  expected: unknown,
  exact: boolean | undefined,
): boolean {
  if (!isPlainObject(expected)) return deepEqual(observed, expected)
  return isPlainObject(observed) && matchesSubset(observed, expected, exact)
}

/**
 * Compara una petición observada contra un `RequestSpec`: método y path por
 * igualdad estricta; `body` y `searchParams` por subconjunto de claves de
 * primer nivel con igualdad profunda por clave, salvo `{ exact: true }`, que
 * exige igualdad estricta de todo el objeto.
 */
export function matchesSpec(
  observed: ResolvedRequest,
  spec: RequestSpec,
): boolean {
  if (observed.method !== spec.method || observed.path !== spec.path) {
    return false
  }

  if (
    spec.searchParams !== undefined &&
    // observed.searchParams sale de Object.fromEntries(url.searchParams): con
    // una clave repetida (`?tag=a&tag=b`) solo sobrevive el último valor. El
    // subconjunto compara ese único valor sin poder detectar la pérdida.
    !matchesSubset(observed.searchParams, spec.searchParams, spec.exact)
  ) {
    return false
  }

  if (
    spec.body !== undefined &&
    !matchesBody(observed.body, spec.body, spec.exact)
  ) {
    return false
  }

  return true
}
