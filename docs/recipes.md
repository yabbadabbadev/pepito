# Recipes

Task-oriented answers for things `pepito` deliberately doesn't wrap in its
own API: chained handlers for successive responses, seeding storage before
mounting, the Mothers pattern for fixtures, cross-origin handlers, and
waiting for the network to settle before a screenshot.

**Different responses across successive calls.** No `pepito` API is needed
for this: it's plain MSW, with chained handlers. The first one that matches
wins, and if it carries `{ once: true }` it deactivates after that first
time, so the request falls through to the next handler in the list:

```tsx
import { http, HttpResponse } from 'msw'
import { get, mount } from '@yabbadabbadev/pepito'
import { App } from '../src/App'
import { ProductListMother } from '../test/mothers/product-list-mother'

test('the second visit already sees the cached catalog', async () => {
  await mount(<App />, {
    network: [
      http.get(
        '/api/products',
        () => HttpResponse.json(ProductListMother.empty()),
        { once: true },
      ),
      http.get('/api/products', () =>
        HttpResponse.json(ProductListMother.catalog()),
      ),
    ],
  })

  await fetch('/api/products') // 1st: the once handler responds and is spent
  await fetch('/api/products') // 2nd: falls through to the handler below
  await fetch('/api/products') // 3rd: the one below isn't once, keeps responding

  await expect(get('/api/products')).toHaveBeenRequestedTimes(3)
  await expect(get('/api/products')).toHaveRespondedWith({
    status: 200,
    body: ProductListMother.empty(),
  })
  await expect(get('/api/products')).toHaveRespondedWith({
    status: 200,
    body: ProductListMother.catalog(),
  })
})
```

Verified in this repo: first call → empty catalog, second and third → full
catalog (X→Y→Y). `setupNetwork()` undoes the test handlers in its
`afterEach` with `worker.resetHandlers()`, so every following test sees a
fresh `once` again, with no exhaustion carrying over between tests.

Each `toHaveRespondedWith` above finds its own entry in the registry — one
matches the empty response, the other the catalog — regardless of the order
the `expect`s are written in. What `pepito` doesn't have yet is a matcher
that asserts the ORDER between two identical requests (for example, "the
empty one before the catalog"): it's in `ROADMAP.md`, because the registry
is already chronological and only needs exposing.

For sequences odder than `once` can express well (three different
responses, or a condition that isn't "the first time"), a counter closure
declared inside the test itself is the alternative — with no changes to
`pepito`:

```ts
test('three different responses for the same route', async () => {
  let callCount = 0

  await mount(<App />, {
    network: [
      http.get('/api/products', () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json([], { status: 202 })
        if (callCount === 2) return HttpResponse.json([], { status: 500 })
        return HttpResponse.json(ProductListMother.catalog())
      }),
    ],
  })

  await fetch('/api/products')
  await fetch('/api/products')
  await fetch('/api/products')

  await expect(get('/api/products')).toHaveRespondedWith(202)
  await expect(get('/api/products')).toHaveRespondedWith(500)
})
```

**Seeding `localStorage`/cookies before mounting.** The browser's storage is
real; no `mount` option is needed for this, a plain `setItem` before `await
mount(...)` is enough:

```ts
test('the catalog respects the saved filter', async () => {
  localStorage.setItem('favoriteFilter', 'bread')
  document.cookie = 'session=abc'

  const screen = await mount(<App />)

  await expect.element(screen.getByText('filter: bread')).toBeVisible()
})
```

**Fixtures with Mothers.** Mocked response payloads follow the house's
Mother/Builder pattern — each Mother models the shape of one endpoint's
response, with named factories for its variants; no loose literals and no
`structuredClone` with mutation, not even in examples copied from here:

```ts
// test/mothers/product-list-mother.ts
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
```

```ts
http.get('/api/products', () => HttpResponse.json(ProductListMother.catalog()))
```

An incidental payload that isn't an entity (`{ ok: true }`) doesn't need a
Mother. `pepito` doesn't export fixture infrastructure — Mothers belong to
each project's own domain.

**The API's host goes in the handler, not in the configuration.** There's no
`defaultHost`: the service worker intercepts cross-origin the same as
same-origin, so the host is a detail of the handler's URL.

```ts
http.get('https://api.example.com/products', () =>
  HttpResponse.json(ProductListMother.catalog()),
)
// or with a wildcard:
http.get('*/products', () => HttpResponse.json(ProductListMother.catalog()))
```

`mount({ path })`, by contrast, does require same-origin — a different
origin there throws with an instruction, because `path` moves the test
document's URL, not the request you want to mock.

**Waiting for the network to settle before capturing.**
`toMatchScreenshot`'s native stabilizer waits for the frame to stop
changing, but a static `<p>Loading…</p>` is also a stable capture: without
waiting for the network, the baseline is the loading screen, not the real
content. Measured in the evaluation repo's
`docs/knowledge/regresion-visual-browser-mode.md`: 0 failures across 17
local runs + 3 in CI waiting for calm this way, with
baselines byte-identical to the ones anchored by `expect.element` to a
specific text. `network.idle()` waits with the same mechanism the network
matchers use, without asserting anything:

```tsx
import { mount, network } from '@yabbadabbadev/pepito'
import { App } from '../src/App'

test('the catalog does not change visually', async () => {
  const screen = await mount(<App />)

  await network.idle()

  await expect.element(screen.getByRole('main')).toMatchScreenshot('catalog')
})
```
