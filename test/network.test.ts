import { delay, http, HttpResponse } from 'msw'
import { get, network } from '../src'
import { stripAnsi } from './ansi'
import { ProductListMother } from './mothers/product-list-mother'
import { worker } from './setup'

test('a clean suite has no requests without a handler', async () => {
  await fetch('/api/products')

  await expect.network().toHaveNoUnhandledRequests()
})

test('a request without a handler trips the guardrail with its path', async () => {
  await fetch('/api/forgotten')

  let failure = ''
  try {
    await expect.network().toHaveNoUnhandledRequests()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('/api/forgotten')
})

test('deliberate passthrough does NOT count as unhandled', async () => {
  await fetch('/api/passthrough')

  await expect.network().toHaveNoUnhandledRequests()
})

test('network.log() dumps the traffic without throwing', async () => {
  await fetch('/api/products')

  await network.log()
})

test('toHaveNoUnhandledRequests outside expect.network() fails with an instruction', async () => {
  let failure = ''
  try {
    await expect('/api/products').toHaveNoUnhandledRequests()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('expect.network()')
})

test('the .not.toHaveNoUnhandledRequests() message carries the negated hint and says the traffic came in clean', async () => {
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

test('network.idle() waits for a slow request to close before resolving', async () => {
  worker.use(
    http.get('/api/slow', async () => {
      await delay(200)
      return HttpResponse.json(ProductListMother.empty())
    }),
  )
  void fetch('/api/slow')

  await network.idle()

  await expect(get('/api/slow')).toHaveBeenRequestedTimes(1)
  await expect(get('/api/slow')).toHaveRespondedWith(200)
})

test('network.idle() with the network already calm resolves without throwing', async () => {
  await network.idle()
})
