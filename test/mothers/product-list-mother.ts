interface ProductResponse {
  id: number
  product_name: string
}

const milk = { id: 1, product_name: 'Whole milk' } satisfies ProductResponse
const bread = { id: 2, product_name: 'Country bread' } satisfies ProductResponse

export const ProductListMother = {
  catalog: (): ProductResponse[] => [milk, bread],
  empty: (): ProductResponse[] => [],
}
