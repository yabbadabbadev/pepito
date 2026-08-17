import { get } from '../src'
import { stripAnsi } from './ansi'
import './setup'

test('toHaveBeenRequested finds a request already made', async () => {
  await fetch('/api/products')

  await expect(get('/api/products')).toHaveBeenRequested()
})

test('toHaveBeenRequested retries: the request can arrive after asserting', async () => {
  setTimeout(() => void fetch('/api/products'), 80)

  await expect(get('/api/products')).toHaveBeenRequested()
})

test('ACCEPTANCE CRITERION: passthrough satisfies toHaveBeenRequested but NOT toHaveBeenIntercepted', async () => {
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

test('the failure message carries the observed traffic, color and diff', async () => {
  await fetch('/api/products?filter=bread')

  let failure = ''
  try {
    await expect(
      get('/api/products', { searchParams: { filter: 'chocolate' } }),
    ).toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(failure).toContain('/api/products') // the traffic dump
  expect(failure).toContain(`${String.fromCharCode(27)}[`) // ANSI, measured in a spike
  expect(failure).toContain('- Expected')
  expect(failure).toContain('+ Received')
  expect(failure).toContain('Observed traffic:')
})

test('with no request to the same method and route, the message does not look for a diff that does not exist', async () => {
  await fetch('/api/products') // real traffic, but for a different route

  let failure = ''
  try {
    await expect(get('/api/never-requested')).toHaveBeenRequested()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(failure).toContain('Expected: ') // the positive label
  expect(failure).toContain('/api/never-requested') // what was expected, in the hint
  expect(failure).toContain('/api/products') // the real traffic, in the dump
  expect(failure).not.toContain('- Expected') // no candidate, no diff to show
})

test('the .not.toHaveBeenIntercepted() message carries the negated hint, not the positive one', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveBeenIntercepted()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveBeenIntercepted\(/)
  expect(failure).toContain('Not expected:')
})
