import { delay, http, HttpResponse } from 'msw'
import { get, network } from '../src'
import { stripAnsi } from './ansi'
import { ProductListMother } from './mothers/product-list-mother'
import { worker } from './setup'

test('una suite limpia no tiene peticiones sin handler', async () => {
  await fetch('/api/products')

  await expect.network().toHaveNoUnhandledRequests()
})

test('una petición sin handler hace saltar el guardarraíl con su path', async () => {
  await fetch('/api/olvidada')

  let failure = ''
  try {
    await expect.network().toHaveNoUnhandledRequests()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('/api/olvidada')
})

test('passthrough deliberado NO cuenta como unhandled', async () => {
  await fetch('/api/passthrough')

  await expect.network().toHaveNoUnhandledRequests()
})

test('network.log() vuelca el tráfico sin lanzar', async () => {
  await fetch('/api/products')

  await network.log()
})

test('toHaveNoUnhandledRequests fuera de expect.network() falla con una instrucción', async () => {
  let failure = ''
  try {
    await expect('/api/products').toHaveNoUnhandledRequests()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('expect.network()')
})

test('el mensaje de .not.toHaveNoUnhandledRequests() lleva el hint negado y dice que el tráfico llegó limpio', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect.network().not.toHaveNoUnhandledRequests()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveNoUnhandledRequests\(/)
  expect(failure).toContain('the traffic came in clean')
})

test('network.idle() espera a que una petición lenta cierre antes de resolver', async () => {
  worker.use(
    http.get('/api/lenta', async () => {
      await delay(200)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  void fetch('/api/lenta')

  await network.idle()

  await expect(get('/api/lenta')).toHaveBeenRequestedTimes(1)
  await expect(get('/api/lenta')).toHaveRespondedWith(200)
})

test('network.idle() con la red ya en calma resuelve sin lanzar', async () => {
  await network.idle()
})
