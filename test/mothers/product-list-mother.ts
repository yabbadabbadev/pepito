interface ProductResponse {
  id: number
  product_name: string
}

const milk = { id: 1, product_name: 'Leche entera' } satisfies ProductResponse
const bread = { id: 2, product_name: 'Pan de pueblo' } satisfies ProductResponse

export const ProductListMother = {
  catalog: (): ProductResponse[] => [milk, bread],
  empty: (): ProductResponse[] => [],
}
