import { http, HttpResponse } from 'msw'
import { get } from '../src'
import { stripAnsi } from './ansi'
import { worker } from './setup'
import { ProductListMother } from './mothers/product-list-mother'

test('matches by status alone', async () => {
  worker.use(
    http.get('/api/rota', () => HttpResponse.json(null, { status: 500 })),
  )
  await fetch('/api/rota')

  await expect(get('/api/rota')).toHaveRespondedWith(500)
})

test('matches by status and a subset of the response body', async () => {
  await fetch('/api/products')

  await expect(get('/api/products')).toHaveRespondedWith({
    status: 200,
    body: ProductListMother.catalog(),
  })
})

test('matches by subset when the response body is an object, not an array', async () => {
  worker.use(
    http.get('/api/producto/1', () =>
      HttpResponse.json({
        id: 1,
        product_name: 'Leche entera',
        stock: 42,
        updated_at: '2026-08-13',
      }),
    ),
  )
  await fetch('/api/producto/1')

  await expect(get('/api/producto/1')).toHaveRespondedWith({
    status: 200,
    body: { product_name: 'Leche entera' },
  })
})

test('the .not.toHaveRespondedWith() message carries the negated hint, not the positive one', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveRespondedWith(200)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveRespondedWith\(/)
  expect(failure).toContain('Not expected:')
})

test('a real response via passthrough does NOT count: it requires an intercepted one', async () => {
  await fetch('/api/passthrough') // the real network responds (Vite's 404)

  let failure = ''
  try {
    await expect(get('/api/passthrough')).toHaveRespondedWith(404)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('toHaveRespondedWith')
})

test('the wrong status shows the response diff', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).toHaveRespondedWith(201)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('- Expected')
  expect(failure).toContain('201')
  expect(failure).toContain('200')
  // The short form doesn't carry `body`: the diff (everything after
  // "- Expected") compares only `status` on both sides, with no
  // `body: undefined` coming from anywhere real. The "Expected" line falls
  // outside the slice because that's where the RequestSpec's `body` from
  // the request does appear — a separate matter, unrelated to this task,
  // shared with the rest of the matchers.
  const diffSection = failure.slice(failure.indexOf('- Expected'))
  expect(diffSection).not.toContain('body')
})

test('a nested body that does not match shows which field changed, not two unrelated blocks', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).toHaveRespondedWith({
      status: 200,
      body: [
        { id: 1, product_name: 'Leche entera' },
        { id: 2, product_name: 'Pan integral' },
      ],
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  // Both product names have to appear: the diff compares value against
  // value in the same field (`body` on both sides), not two unrelated
  // blocks (`body` disappears, `responseBody` appears).
  expect(failure).toContain('Pan de pueblo') // the real value, untouched
  expect(failure).toContain('Pan integral') // the expected value, which didn't match
  expect(failure).not.toContain('responseBody')
})
