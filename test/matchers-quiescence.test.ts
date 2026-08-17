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
    http.get('/api/slow', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  void fetch('/api/slow')

  // Without quiescence this would pass falsely: the request isn't visible yet.
  let failure = ''
  try {
    await expect(get('/api/slow')).not.toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('/api/slow')
})

test('DETERMINISM: Times(2) does not confuse 2 with 3 even though the third is in flight', async () => {
  worker.use(
    http.get('/api/slow', async () => {
      await delay(120)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  await Promise.all([fetch('/api/slow'), fetch('/api/slow')])
  void fetch('/api/slow') // the third, still in flight when asserting

  let failure = ''
  try {
    await expect(get('/api/slow')).toHaveBeenRequestedTimes(2)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toMatch(/3/) // the message says how many it actually found
})

test('Times(3) passes when there are exactly 3', async () => {
  worker.use(
    http.get('/api/fast', () => HttpResponse.json(ProductListMother.empty())),
  )
  await Promise.all([
    fetch('/api/fast'),
    fetch('/api/fast'),
    fetch('/api/fast'),
  ])

  await expect(get('/api/fast')).toHaveBeenRequestedTimes(3)
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
    http.get('/api/fast', () => HttpResponse.json(ProductListMother.empty())),
  )
  await fetch('/api/fast')

  let failure = ''
  try {
    await expect(get('/api/fast')).not.toHaveBeenRequestedTimes(1)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenRequestedTimes\(/)
  expect(failure).toContain('Did not expect')
})
