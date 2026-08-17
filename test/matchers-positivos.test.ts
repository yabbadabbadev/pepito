import { get } from '../src'
import { stripAnsi } from './ansi'
import './setup'

test('toHaveBeenRequested encuentra una petición ya hecha', async () => {
  await fetch('/api/products')

  await expect(get('/api/products')).toHaveBeenRequested()
})

test('toHaveBeenRequested reintenta: la petición puede llegar después de asertar', async () => {
  setTimeout(() => void fetch('/api/products'), 80)

  await expect(get('/api/products')).toHaveBeenRequested()
})

test('CRITERIO DE ACEPTACIÓN: passthrough cumple toHaveBeenRequested pero NO toHaveBeenIntercepted', async () => {
  await fetch('/api/passthrough')

  await expect(get('/api/passthrough')).toHaveBeenRequested()

  let failure = ''
  try {
    await expect(get('/api/passthrough')).toHaveBeenIntercepted()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('toHaveBeenIntercepted')
})

test('el mensaje de fallo lleva el tráfico observado, color y diff', async () => {
  await fetch('/api/products?filtro=pan')

  let failure = ''
  try {
    await expect(
      get('/api/products', { searchParams: { filtro: 'chocolate' } }),
    ).toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(failure).toContain('/api/products') // el volcado del tráfico
  expect(failure).toContain(`${String.fromCharCode(27)}[`) // ANSI, medido en spike
  expect(failure).toContain('- Expected')
  expect(failure).toContain('+ Received')
})

test('sin ninguna petición al mismo método y ruta, el mensaje no busca un diff que no existe', async () => {
  await fetch('/api/products') // tráfico real, pero de una ruta distinta

  let failure = ''
  try {
    await expect(get('/api/nunca-solicitada')).toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(failure).toContain('/api/nunca-solicitada') // lo esperado, en el hint
  expect(failure).toContain('/api/products') // el tráfico real, en el volcado
  expect(failure).not.toContain('- Expected') // no hay candidato, no hay diff que enseñar
})

test('el mensaje de .not.toHaveBeenIntercepted() lleva el hint negado, no el positivo', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveBeenIntercepted()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenIntercepted\(/)
  expect(failure).toContain('No esperaba:')
})
