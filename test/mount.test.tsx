import { http, HttpResponse } from 'msw'
import { get, mount } from '../src'
// Imported only for its side effect: setupNetwork() runs when this module
// loads. No test in this file needs the `worker` itself —
// `mount({ network: [...] })` already calls worker.use() internally — but
// without this import mount('mount')'s guard would still see the singleton
// empty.
import './setup'
import { RoutedApp } from './routed-app'
import { ProductListMother } from './mothers/product-list-mother'

const initialPath = location.pathname

test('mounts plain and returns the vitest-browser-react screen', async () => {
  const screen = await mount(<RoutedApp />)

  await expect.element(screen.getByText('Home page')).toBeVisible()
})

test('ACCEPTANCE CRITERION: mounts on a full URI that the router reads', async () => {
  const screen = await mount(<RoutedApp />, {
    path: '/products?filter=bread#detail',
  })

  await expect.element(screen.getByText('filter: bread')).toBeVisible()
  await expect.element(screen.getByText('hash: #detail')).toBeVisible()
})

test('ACCEPTANCE CRITERION: the URL is restored — this test does NOT inherit the previous route', async () => {
  expect(location.pathname).toBe(initialPath)

  const screen = await mount(<RoutedApp />)
  await expect.element(screen.getByText('Home page')).toBeVisible()
})

test('network handlers take priority over the suite handlers', async () => {
  await mount(<RoutedApp />, {
    network: [
      http.get('/api/products', () =>
        HttpResponse.json(ProductListMother.empty(), { status: 206 }),
      ),
    ],
  })

  const response = await fetch('/api/products')
  expect(response.status).toBe(206)
  await expect(get('/api/products')).toHaveBeenIntercepted()
})

test('a path that does not start with / fails with an instruction, not a SecurityError', async () => {
  await expect(
    mount(<RoutedApp />, { path: 'https://another.web/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
})

test('a protocol-relative path passes the "/" prefix but is not same-origin', async () => {
  await expect(
    mount(<RoutedApp />, { path: '//evil.com/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
  await expect(
    mount(<RoutedApp />, { path: '/\\evil.com/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
})
