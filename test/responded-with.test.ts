import { http, HttpResponse } from 'msw'
import { get } from '../src'
import { stripAnsi } from './ansi'
import { worker } from './setup'
import { ProductListMother } from './mothers/product-list-mother'

test('casa por status a secas', async () => {
  worker.use(
    http.get('/api/rota', () => HttpResponse.json(null, { status: 500 })),
  )
  await fetch('/api/rota')

  await expect(get('/api/rota')).toHaveRespondedWith(500)
})

test('casa por status y subconjunto del body de la respuesta', async () => {
  await fetch('/api/products')

  await expect(get('/api/products')).toHaveRespondedWith({
    status: 200,
    body: ProductListMother.catalog(),
  })
})

test('casa por subconjunto cuando el body de la respuesta es un objeto, no un array', async () => {
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

test('el mensaje de .not.toHaveRespondedWith() lleva el hint negado, no el positivo', async () => {
  await fetch('/api/products')

  let failure = ''
  try {
    await expect(get('/api/products')).not.toHaveRespondedWith(200)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  expect(stripAnsi(failure)).toMatch(/\.not\.toHaveRespondedWith\(/)
  expect(failure).toContain('No esperaba:')
})

test('una respuesta real vía passthrough NO cuenta: exige interceptada', async () => {
  await fetch('/api/passthrough') // responde la red real (404 de Vite)

  let failure = ''
  try {
    await expect(get('/api/passthrough')).toHaveRespondedWith(404)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(failure).toContain('toHaveRespondedWith')
})

test('el status equivocado enseña el diff de la respuesta', async () => {
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
  // La forma corta no lleva `body`: el diff (todo lo que sigue a "- Expected")
  // compara solo `status` a los dos lados, sin un `body: undefined` que no
  // viene de ningún lado real. La línea "Esperaba" queda fuera del recorte
  // porque ahí sí aparece el `body` del RequestSpec de la petición —asunto
  // ajeno a esta tarea, compartido con el resto de matchers.
  const diffSection = failure.slice(failure.indexOf('- Expected'))
  expect(diffSection).not.toContain('body')
})

test('un body anidado que no casa enseña qué campo cambió, no dos bloques sueltos', async () => {
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
  // Ambos nombres de producto tienen que aparecer: el diff compara valor
  // contra valor en el mismo campo (`body` a los dos lados), no dos bloques
  // sin relación (`body` desaparece, `responseBody` aparece).
  expect(failure).toContain('Pan de pueblo') // el valor real, sin tocar
  expect(failure).toContain('Pan integral') // el valor esperado, que no casó
  expect(failure).not.toContain('responseBody')
})
