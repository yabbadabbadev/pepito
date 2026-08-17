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

// Excludes null (typeof null === 'object') and arrays: both match by direct
// deep equality, not by subset of keys.
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
 * Compares an observed value against an expected one by subset of
 * top-level keys with deep equality per key (or direct deep equality if
 * `expected` isn't a plain object), unless `exact: true`, which requires
 * strict equality of the whole object. Used both by `matchesSpec` over the
 * request's `body` and by `toHaveRespondedWith` over the `responseBody`:
 * same subset semantics, two different places it's applied.
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
 * Compares an observed request against a `RequestSpec`: method and path by
 * strict equality; `body` and `searchParams` by subset of top-level keys
 * with deep equality per key, unless `{ exact: true }`, which requires
 * strict equality of the whole object.
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
    // observed.searchParams comes from Object.fromEntries(url.searchParams):
    // with a repeated key (`?tag=a&tag=b`) only the last value survives. The
    // subset comparison checks that single value without being able to
    // detect the loss.
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
