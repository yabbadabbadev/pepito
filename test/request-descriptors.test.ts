import {
  del,
  get,
  patch,
  post,
  put,
  query,
  request,
} from '../src/request-descriptors'

test('each builder delegates to request with its HTTP verb', () => {
  const builders = [
    [get, 'GET'],
    [post, 'POST'],
    [put, 'PUT'],
    [patch, 'PATCH'],
    [del, 'DELETE'],
    [query, 'QUERY'],
  ] as const

  for (const [builder, method] of builders) {
    expect(builder('/api/products', { exact: true })).toEqual({
      method,
      path: '/api/products',
      exact: true,
    })
  }
})

test('request is the escape hatch for any method, with no options', () => {
  expect(request('OPTIONS', '/api/products')).toEqual({
    method: 'OPTIONS',
    path: '/api/products',
  })
})
