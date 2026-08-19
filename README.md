# pepito

Network test utilities for Vitest browser mode: mount the application with
`mount` and assert on the traffic observed by MSW with `expect` matchers. It
doesn't abstract MSW — handlers are still declared with the usual
`http.get(...)` — it only provides the startup, the traffic registry and the
matchers to query it.

## 1. Install and start

`react`, `react-dom`, `vitest`, `msw` and `vitest-browser-react` are
**peerDependencies**: install them if your project doesn't already have
them.

```bash
npm i -D @yabbadabbadev/pepito msw vitest-browser-react
npx msw init public --save
```

`npx msw init public --save` generates the service worker MSW needs in
browser mode (`public/mockServiceWorker.js`); it's a one-off, not a
day-to-day step — it's only repeated when upgrading MSW's version.

Call `setupNetwork` once, in a `setupFiles` file of `vitest.config` — never
inside a test:

```ts
// vitest.setup.ts
import { setupNetwork } from '@yabbadabbadev/pepito'
import { handlers } from './handlers'

setupNetwork(handlers)
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    browser: {/* … */},
  },
})
```

`setupNetwork`'s second argument passes straight through to
`worker.start()`, with no wrapper of its own — for example, to make a
request with no handler fail the test instead of just warning on the
console:

```ts
// vitest.setup.ts
import { setupNetwork } from '@yabbadabbadev/pepito'
import { handlers } from './handlers'

setupNetwork(handlers, { onUnhandledRequest: 'error' })
```

Importing anything from `pepito` — here, `setupNetwork` — already brings the
network matchers along as `expect` types: there's no separate type
registration. If your test `tsconfig` doesn't include the setup file, `tsc`
won't see the augmentation and `expect(...).toHaveBeenRequested()` will
raise `TS2339` even though the test passes at runtime.

## 2. Mount the application

`mount` mounts with `vitest-browser-react` and returns its `screen`
unwrapped. It requires `setupNetwork` to have run first (section 1), **even
for a test with no network**: the coupling is deliberate — `mount` also
installs URL and storage cleanup between tests, not just the network — and
if it's missing, it fails immediately with a fix instruction.

```tsx
import { http, HttpResponse } from 'msw'
import { mount, get } from '@yabbadabbadev/pepito'
import { App } from '../src/App'
import { ProductListMother } from '../test/mothers/product-list-mother'

test('the catalog page renders the URL filter', async () => {
  const screen = await mount(<App />, {
    path: '/products?filter=bread',
    network: [
      http.get('/api/products', () =>
        HttpResponse.json(ProductListMother.catalog()),
      ),
    ],
  })

  await expect.element(screen.getByText('filter: bread')).toBeVisible()
  await expect(get('/api/products')).toHaveBeenRequested()
})
```

`path` is a **complete** same-origin URI starting with `/` — query and hash
included — because your application's router (`BrowserRouter` or whichever)
reads it from the document's real URL, not from a `MemoryRouter`. A
different origin isn't a valid `path`: it's mocked in the `handlers`, not in
the mount — see section 7.

`network` are this test's own MSW handlers: they're installed with
`worker.use()` before render, so they win over the suite's for the same
route, and `setupNetwork()` undoes them afterwards in its `afterEach`.
Neither option is required — `mount(<App />)` on its own just mounts:

```tsx
import { mount } from '@yabbadabbadev/pepito'
import { App } from '../src/App'

test('mounts with no path or network of its own', async () => {
  const screen = await mount(<App />)

  await expect.element(screen.getByText('Product catalog')).toBeVisible()
})
```

`path` can carry query and hash together, because both flow through the
router the same as the rest of the URI:

```tsx
const screen = await mount(<App />, { path: '/products?filter=bread#detail' })

await expect.element(screen.getByText('filter: bread')).toBeVisible()
await expect.element(screen.getByText('hash: #detail')).toBeVisible()
```

## 3. Assert a request

The five matchers, at a glance:

| Matcher                     | What it asserts                                                         |
| --------------------------- | ----------------------------------------------------------------------- |
| `toHaveBeenRequested`       | The application made the request                                        |
| `toHaveBeenRequestedTimes`  | Exactly `count` matching requests were made                             |
| `toHaveBeenIntercepted`     | One of your handlers produced the response                              |
| `toHaveRespondedWith`       | The intercepted response has the expected status/body                   |
| `toHaveNoUnhandledRequests` | No observed request was left without a handler (via `expect.network()`) |

```ts
import { get, post } from '@yabbadabbadev/pepito'

await expect(get('/api/products')).toHaveBeenRequested()
await expect(get('/api/products')).toHaveBeenRequestedTimes(2)
await expect(post('/api/products')).not.toHaveBeenRequested()
```

`get`, `post`, `put`, `patch`, `del` and `query` describe the expected
request — all six are shortcuts for `request(method, path)` with the method
already fixed. For any other method use `request(method, path)` directly:
it's the escape hatch that covers even the ones MSW 2.15 still doesn't
expose as a handler helper:

```ts
import { del, patch, put, query, request } from '@yabbadabbadev/pepito'

await expect(
  put('/api/products/1', { body: { product_name: 'Whole milk' } }),
).toHaveBeenRequested()
await expect(
  patch('/api/products/1', { body: { stock: 3 } }),
).toHaveBeenRequested()
await expect(del('/api/products/1')).toHaveBeenRequested()
await expect(
  query('/api/products', { searchParams: { filter: 'bread' } }),
).toHaveBeenRequested()
await expect(request('OPTIONS', '/api/products')).toHaveBeenRequested()
```

Body and `searchParams` match by **subset**:

```ts
import { get, post } from '@yabbadabbadev/pepito'

await expect(
  get('/api/products', { searchParams: { filter: 'bread' } }),
).toHaveBeenRequested()
await expect(
  post('/api/products', { body: { product_name: 'Whole milk' } }),
).toHaveBeenRequested()
```

`post('/api/products', { body: { product_name: 'Whole milk' } })` matches
even if the real request also carries `id`. Pass `{ exact: true }` when you
need strict equality of the whole object, not just the keys you list in
`body`:

```ts
await expect(
  post('/api/products', {
    body: { product_name: 'Whole milk' },
    exact: true,
  }),
).toHaveBeenRequested()
```

A `searchParams` key repeated in the real URL (`?tag=a&tag=b`) collapses to
its last value before comparing — the matcher can't tell that request apart
from one where the key appears only once.

The matchers retry because a request is an effect that follows the
interaction, just like `expect.element` — there's no need to wrap them in a
`waitFor`. `.not.toHaveBeenRequested()` and `toHaveBeenRequestedTimes` are
the exception: before deciding, they wait for the network to settle, so as
not to confuse a request that hasn't arrived yet with one that never
happened.

## 4. Intercepted or escaped

`toHaveBeenRequested` and `toHaveBeenIntercepted` assert different things
(see the table in section 3). A handler with `passthrough()` satisfies the first and not the second: the
response came from the real network, not from your mock.

```ts
import { http, passthrough } from 'msw'
import { get } from '@yabbadabbadev/pepito'

// handler: http.get('/api/legacy', () => passthrough())

await fetch('/api/legacy')

await expect(get('/api/legacy')).toHaveBeenRequested() // passes
await expect(get('/api/legacy')).toHaveBeenIntercepted() // fails
```

To catch what doesn't even have a handler, the suite-wide guardrail:

```ts
await expect.network().toHaveNoUnhandledRequests()
```

`toHaveNoUnhandledRequests` hangs off `expect.network()`, not off a request
descriptor, because it doesn't describe one specific request but all the
observed traffic.

## 5. What the mock responded

```ts
import { get } from '@yabbadabbadev/pepito'

await expect(get('/api/products')).toHaveRespondedWith(500)

await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: { total: 2 },
})
```

A bare number is the shorthand for `{ status }`. The `body`, if given,
matches by subset the same way as in request descriptors — `{ exact: true }`
for strict equality:

```ts
import { get } from '@yabbadabbadev/pepito'
import { ProductListMother } from '../test/mothers/product-list-mother'

await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: ProductListMother.catalog(),
  exact: true,
})
```

`toHaveRespondedWith` also requires the request to have been intercepted: a
real response via `passthrough()` never counts, even if the status happens
to match.

## 6. Debug a failure

Failure messages carry the full observed traffic and a colored diff
(Vitest's `this.utils`, the same one native matchers use — no new
dependencies):

```
expect(received).toHaveBeenRequested(expected)

Expected: Object {
  "body": undefined,
  "method": "GET",
  "path": "/api/products",
  "searchParams": Object {
    "filter": "chocolate",
  },
}

- Expected
+ Received

  {
    "body": undefined,
    "searchParams": {
-     "filter": "chocolate",
+     "filter": "bread",
    },
  }

Observed traffic:
  GET /api/products?filter=bread → 200 [matched/mocked]
```

(real output, captured without color; in your terminal `- Expected`/`+
Received` arrive in green and red)

To look at the traffic without anything failing, in the middle of a test
you're debugging:

```ts
import { network } from '@yabbadabbadev/pepito'

await fetch('/api/products')
await network.log() // dumps method, path, body and status to the console
```

If a failure message doesn't explain what you expected, that's a matcher
defect, not something to work around by hand: failure messages are part of
the product and are tested like any other output (see `CONTRIBUTING.md`).

## 7. Recipes

Task-oriented answers for what `pepito` deliberately doesn't wrap in its own
API: chaining handlers for successive responses, seeding storage before
mounting, the Mothers pattern for fixtures, cross-origin handlers, and
waiting for the network to settle before a screenshot. See
[`docs/recipes.md`](docs/recipes.md).

## About the name

Published on npm as `@yabbadabbadev/pepito`; `pepito` remains the project's
code-name and this directory's name. See `CONTRIBUTING.md` to run the tests
and publish a version, and `ROADMAP.md` for what's out of scope for this
version.

## License

MIT, see [`LICENSE`](LICENSE).
