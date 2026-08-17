import { http, HttpResponse, passthrough } from 'msw'
import { ProductListMother } from './mothers/product-list-mother'

export const suiteHandlers = [
  http.get('/api/products', () =>
    HttpResponse.json(ProductListMother.catalog()),
  ),
  http.get('/api/passthrough', () => passthrough()),
]
