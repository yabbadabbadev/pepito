import { delay, http, HttpResponse } from 'msw'
import { get } from '../src'
import { stripAnsi } from './ansi'
import { worker } from './setup'
import { ProductListMother } from './mothers/product-list-mother'

test('not.toHaveBeenRequested passes when there really was no request', async () => {
  await expect(get('/api/products')).not.toHaveBeenRequested()
})

test('DETERMINISM: not waits for calm and catches the slow request in flight', async () => {
  worker.use(
    http.get('/api/lenta', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  void fetch('/api/lenta')

  // Without quiescence this would pass falsely: the request isn't visible yet.
  let failure = ''
  try {
    await expect(get('/api/lenta')).not.toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('/api/lenta')
})

test('DETERMINISM: Times(2) does not confuse 2 with 3 even though the third is in flight', async () => {
  worker.use(
    http.get('/api/lenta', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  await Promise.all([fetch('/api/lenta'), fetch('/api/lenta')])
  void fetch('/api/lenta') // the third, still in flight when asserting

  let failure = ''
  try {
    await expect(get('/api/lenta')).toHaveBeenRequestedTimes(2)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toMatch(/3/) // the message says how many it actually found
})

test('Times(3) passes when there are exactly 3', async () => {
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

test('the .not.toHaveBeenRequested() message carries the negated hint, not the positive one', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenRequested\(/)
  expect(failure).toContain('Not expected:')
})

test('the .not.toHaveBeenRequestedTimes(n) message carries the negated hint and says it did find that count', async () => {
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
  expect(failure).toContain('Did not expect')
})
