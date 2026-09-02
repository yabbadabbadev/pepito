import { http, HttpResponse } from 'msw'
import { mount } from '../src/svelte'
import { get } from '../src'
import './setup'
import HelloWorld from './fixtures/HelloWorld.svelte'

test('svelte mount renders the component', async () => {
  const screen = await mount(HelloWorld)
  await expect.element(screen.getByText('Hello from Svelte')).toBeVisible()
})

test('svelte mount with network handlers', async () => {
  const screen = await mount(HelloWorld, {
    network: [
      http.get('/api/data', () => HttpResponse.json({ ok: true })),
    ],
  })

  await expect.element(screen.getByText('Hello from Svelte')).toBeVisible()

  await fetch('/api/data')
  await expect(get('/api/data')).toHaveRespondedWith(200)
})