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

test('casa por método y path', () => {
  expect(matchesSpec(observedWith({}), get('/api/products'))).toBe(true)
  expect(matchesSpec(observedWith({}), post('/api/products'))).toBe(false)
  expect(matchesSpec(observedWith({}), get('/api/otra'))).toBe(false)
})

test('el body casa por subconjunto: claves extra en lo observado no molestan', () => {
  const observed = observedWith({
    method: 'POST',
    body: { product_name: 'Leche', id: 7, created_at: 'hoy' },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { product_name: 'Leche' } }),
    ),
  ).toBe(true)
})

test('con exact, una clave extra rompe el matching', () => {
  const observed = observedWith({ method: 'POST', body: { a: 1, b: 2 } })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { a: 1 }, exact: true }),
    ),
  ).toBe(false)
})

test('con exact, una clave que falta en lo observado también rompe el matching', () => {
  const observed = observedWith({ method: 'POST', body: { a: 1 } })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { a: 1, b: 2 }, exact: true }),
    ),
  ).toBe(false)
})

test('searchParams casa por subconjunto y exact exige igualdad', () => {
  const observed = observedWith({
    searchParams: { filtro: 'pan', pagina: '2' },
  })

  expect(
    matchesSpec(
      observed,
      get('/api/products', { searchParams: { filtro: 'pan' } }),
    ),
  ).toBe(true)
  expect(
    matchesSpec(
      observed,
      get('/api/products', { searchParams: { filtro: 'pan' }, exact: true }),
    ),
  ).toBe(false)
})

test('la igualdad por clave es profunda, no de referencia', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detalle: { unidades: 3 } },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detalle: { unidades: 3 } } }),
    ),
  ).toBe(true)
})

test('un body que no es objeto plano casa por igualdad profunda directa', () => {
  const observed = observedWith({ method: 'POST', body: [1, 2, 3] })

  expect(
    matchesSpec(observed, post('/api/products', { body: [1, 2, 3] })),
  ).toBe(true)
  expect(matchesSpec(observed, post('/api/products', { body: [1, 2] }))).toBe(
    false,
  )
})

test('null no se trata como objeto plano aunque typeof lo diga', () => {
  const observed = observedWith({ method: 'POST', body: null })

  expect(matchesSpec(observed, post('/api/products', { body: null }))).toBe(
    true,
  )
  expect(matchesSpec(observed, post('/api/products', { body: { a: 1 } }))).toBe(
    false,
  )
})

test('un valor de tipo distinto anidado no casa, aunque ninguno sea null', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detalle: 'sin estructurar' },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detalle: { unidades: 3 } } }),
    ),
  ).toBe(false)
})

test('un valor anidado null no casa contra un objeto anidado', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detalle: { unidades: 3 } },
  })

  expect(
    matchesSpec(observed, post('/api/products', { body: { detalle: null } })),
  ).toBe(false)
})

test('un array anidado no casa contra un objeto anidado, aunque ambos sean "object"', () => {
  const observed = observedWith({
    method: 'POST',
    body: { detalle: [1, 2] },
  })

  expect(
    matchesSpec(
      observed,
      post('/api/products', { body: { detalle: { a: 1 } } }),
    ),
  ).toBe(false)
})

test('sin body ni searchParams en el spec, no se comprueban', () => {
  const observed = observedWith({
    method: 'POST',
    body: { cualquiera: true },
    searchParams: { cualquiera: 'si' },
  })

  expect(matchesSpec(observed, post('/api/products'))).toBe(true)
})
