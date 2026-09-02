import { h, defineComponent } from 'vue'
import { http, HttpResponse } from 'msw'
import { mount } from '../src/vue'
import { get } from '../src'
import './setup'

const HelloWorld = defineComponent({
  setup() {
    return () => h('p', null, 'Hello from Vue')
  },
})

test('vue mount renders the component', async () => {
  const screen = await mount(HelloWorld)
  await expect.element(screen.getByText('Hello from Vue')).toBeVisible()
})

test('vue mount with network handlers', async () => {
  const screen = await mount(HelloWorld, {
    network: [
      http.get('/api/data', () => HttpResponse.json({ ok: true })),
    ],
  })

  await expect.element(screen.getByText('Hello from Vue')).toBeVisible()

  await fetch('/api/data')
  await expect(get('/api/data')).toHaveRespondedWith(200)
})