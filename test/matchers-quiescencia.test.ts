import { delay, http, HttpResponse } from 'msw'
import { get } from '../src'
import { stripAnsi } from './ansi'
import { worker } from './setup'
import { ProductListMother } from './mothers/product-list-mother'

test('not.toHaveBeenRequested pasa cuando de verdad no hubo petición', async () => {
  await expect(get('/api/products')).not.toHaveBeenRequested()
})

test('DETERMINISMO: not espera la calma y caza la petición lenta en vuelo', async () => {
  worker.use(
    http.get('/api/lenta', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  void fetch('/api/lenta')

  // Sin quiescencia esto pasaría en falso: la petición aún no se ve.
  let failure = ''
  try {
    await expect(get('/api/lenta')).not.toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('/api/lenta')
})

test('DETERMINISMO: Times(2) no confunde 2 con 3 aunque la tercera esté en vuelo', async () => {
  worker.use(
    http.get('/api/lenta', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  await Promise.all([fetch('/api/lenta'), fetch('/api/lenta')])
  void fetch('/api/lenta') // la tercera, todavía en vuelo al asertar

  let failure = ''
  try {
    await expect(get('/api/lenta')).toHaveBeenRequestedTimes(2)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toMatch(/3/) // el mensaje dice cuántas encontró de verdad
})

test('Times(3) pasa cuando son exactamente 3', async () => {
  worker.use(
    http.get('/api/rapida', () => HttpResponse.json(ProductListMother.empty())),
  )
  await Promise.all([
    fetch('/api/rapida'),
    fetch('/api/rapida'),
    fetch('/api/rapida'),
  ])

  await expect(get('/api/rapida')).toHaveBeenRequestedTimes(3)
})

test('el mensaje de .not.toHaveBeenRequested() lleva el hint negado, no el positivo', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenRequested\(/)
  expect(failure).toContain('No esperaba:')
})

test('el mensaje de .not.toHaveBeenRequestedTimes(n) lleva el hint negado y dice que sí encontró ese conteo', async () => {
  worker.use(
    http.get('/api/rapida', () => HttpResponse.json(ProductListMother.empty())),
  )
  await fetch('/api/rapida')

  let failure = ''
  try {
    await expect(get('/api/rapida')).not.toHaveBeenRequestedTimes(1)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenRequestedTimes\(/)
  expect(failure).toContain('No esperaba')
})
