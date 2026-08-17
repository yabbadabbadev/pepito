import { get, post } from '../src/request-descriptors'
import { matchesSpec } from '../src/spec-matching'
import type { ResolvedRequest } from '../src/traffic-registry'

const observedWith = (partial: Partial<ResolvedRequest>): ResolvedRequest => ({
  requestId: 'r1',
  method: 'GET',
  origin: 'http://localhost',
  path: '/api/products',
  searchParams: {},
  body: undefined,
  matched: true,
  mocked: true,
  bypassed: false,
  unhandled: false,
  status: 200,
  responseBody: undefined,
  ...partial,
})

test('matches by method and path', () => {
  expect(matchesSpec(observedWith({}), get('/api/products'))).toBe(true)
  expect(matchesSpec(observedWith({}), post('/api/products'))).toBe(false)
  expect(matchesSpec(observedWith({}), get('/api/other'))).toBe(false)
})

test('the body matches by subset: extra keys in the observed one do not matter', () => {
  const observed = observedWith({
    method: 'POST',
    body: { product_name: 'Milk', id: 7, created_at: 'today' },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { product_name: 'Milk' } }),
    ),
  ).toBe(true)
})

test('with exact, an extra key breaks the match', () => {
  const observed = observedWith({ method: 'POST', body: { a: 1, b: 2 } })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { a: 1 }, exact: true }),
    ),
  ).toBe(false)
})

test('with exact, a key missing from the observed one also breaks the match', () => {
  const observed = observedWith({ method: 'POST', body: { a: 1 } })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { a: 1, b: 2 }, exact: true }),
    ),
  ).toBe(false)
})

test('searchParams matches by subset and exact requires equality', () => {
  const observed = observedWith({
    searchParams: { filter: 'bread', page: '2' },
  })

  expect(
    matchesSpec(
      observed,
      get('/api/products', { searchParams: { filter: 'bread' } }),
    ),
  ).toBe(true)
  expect(
    matchesSpec(
      observed,
      get('/api/products', { searchParams: { filter: 'bread' }, exact: true }),
    ),
  ).toBe(false)
})

test('equality per key is deep, not by reference', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detail: { units: 3 } },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detail: { units: 3 } } }),
    ),
  ).toBe(true)
})

test('a body that is not a plain object matches by direct deep equality', () => {
  const observed = observedWith({ method: 'POST', body: [1, 2, 3] })

  expect(
    matchesSpec(observed, post('/api/products', { body: [1, 2, 3] })),
  ).toBe(true)
  expect(matchesSpec(observed, post('/api/products', { body: [1, 2] }))).toBe(
    false,
  )
})

test('null is not treated as a plain object even though typeof says so', () => {
  const observed = observedWith({ method: 'POST', body: null })

  expect(matchesSpec(observed, post('/api/products', { body: null }))).toBe(
    true,
  )
  expect(matchesSpec(observed, post('/api/products', { body: { a: 1 } }))).toBe(
    false,
  )
})

test('a nested value of a different type does not match, even when neither is null', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detail: 'unstructured' },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detail: { units: 3 } } }),
    ),
  ).toBe(false)
})

test('a nested null value does not match against a nested object', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detail: { units: 3 } },
  })

  expect(
    matchesSpec(observed, post('/api/products', { body: { detail: null } })),
  ).toBe(false)
})

test('a nested array does not match against a nested object, even though both are "object"', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detail: [1, 2] },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detail: { a: 1 } } }),
    ),
  ).toBe(false)
})

test('with no body or searchParams in the spec, neither is checked', () => {
  const observed = observedWith({
    method: 'POST',
    body: { anything: true },
    searchParams: { anything: 'yes' },
  })

  expect(matchesSpec(observed, post('/api/products'))).toBe(true)
})
