import { http, HttpResponse } from 'msw'
import { get, mount } from '../src'
// Importado solo por su efecto secundario: setupNetwork() se llama al cargar
// este módulo. Ningún test de este fichero necesita el `worker` en sí —
// `mount({ network: [...] })` ya llama a worker.use() por dentro — pero sin
// este import el guard de mount('mount') seguiría viendo el singleton vacío.
import './setup'
import { RoutedApp } from './routed-app'
import { ProductListMother } from './mothers/product-list-mother'

const initialPath = location.pathname

test('monta a secas y devuelve el screen de vitest-browser-react', async () => {
  const screen = await mount(<RoutedApp />)

  await expect.element(screen.getByText('Página de inicio')).toBeVisible()
})

test('CRITERIO DE ACEPTACIÓN: monta en una URI completa que el router lee', async () => {
  const screen = await mount(<RoutedApp />, {
    path: '/products?filtro=pan#detalle',
  })

  await expect.element(screen.getByText('filtro: pan')).toBeVisible()
  await expect.element(screen.getByText('hash: #detalle')).toBeVisible()
})

test('CRITERIO DE ACEPTACIÓN: la URL se restaura — este test NO hereda la ruta anterior', async () => {
  expect(location.pathname).toBe(initialPath)

  const screen = await mount(<RoutedApp />)
  await expect.element(screen.getByText('Página de inicio')).toBeVisible()
})

test('los handlers de network tienen prioridad sobre los de la suite', async () => {
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

test('un path que no empieza por / falla con instrucción, no con SecurityError', async () => {
  await expect(
    mount(<RoutedApp />, { path: 'https://otra.web/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
})

test('un path protocol-relative pasa el prefijo "/" pero no es same-origin', async () => {
  await expect(
    mount(<RoutedApp />, { path: '//evil.com/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
  await expect(
    mount(<RoutedApp />, { path: '/\\evil.com/products' }),
  ).rejects.toThrow(/same-origin.*starts with '\/'/s)
})
