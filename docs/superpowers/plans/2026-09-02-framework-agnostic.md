# Framework-Agnostic Core + Subpath Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the React-specific `mount` from the core into a subpath export, exposing a generic `mountCore` instead, and ship `/react`, `/vue`, and `/svelte` subpath adapters.

**Architecture:** `mount.ts` becomes `mount-core.ts` with `ui: unknown` + a `render` callback. Three new 10-line files (`react.ts`, `vue.ts`, `svelte.ts`) each import their `vitest-browser-*` and wrap `mountCore`. The core barrel drops `mount`/`MountOptions` and adds `mountCore`. peerDeps shed React.

**Tech Stack:** TypeScript, Vitest browser mode, MSW, vitest-browser-react/vue/svelte

**Spec:** `docs/superpowers/specs/2026-09-02-framework-agnostic-design.md`

## Global Constraints

- Strict TS (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`)
- ESLint 0 warnings, Prettier clean
- 90/90 coverage on `src/`
- TDD with the red visible
- TSDoc on everything exported
- No AI-looking code (comments restating code; generic names; premature abstraction; suspicious uniformity)
- English everywhere (code comments, TSDoc, test names, commit messages, failure messages)
- Never commit on `main`: work branch and PR, always
- Quality harness is not optional: run `npm run typecheck && npm run lint && npm run format:check && npm run coverage` after implementation

---

### Task 1: Rename `mount.ts` → `mount-core.ts` with generic signature

**Files:**

- Create: `src/mount-core.ts` (rename + modify from `src/mount.ts`)
- Modify: `src/mount.ts` (delete after creation verified)

**Interfaces:**

- Consumes: `requireNetworkContext` from `./network-singleton`
- Produces: `mountCore<T>(component, render, options?) → Promise<T>`, `MountOptions`, `MountResult`

**What changes from the current `mount.ts`:**

- `ui: ReactElement` → `component: unknown`
- Second parameter becomes `render: (component: unknown) => T | Promise<T>` (generic)
- `MountOptions` stays the same (`path`, `network`)
- Return type becomes `Promise<T>` where `T extends MountResult`
- `MountResult` is a new exported interface: `{ container: Element }`
- `isSameOriginPath` stays (already agnostic)
- `pushState`, `worker.use(...)` logic stays
- `return render(ui)` → `return await Promise.resolve(render(component))` (handles both sync and async render)
- TSDoc updated: no more React/BrowserRouter references, describes the generic contract
- `import type { ReactElement } from 'react'` → removed
- `import { render, type RenderResult } from 'vitest-browser-react'` → removed

- [ ] **Step 1: Read the current `src/mount.ts` to confirm the exact content**

- [ ] **Step 2: Create `src/mount-core.ts`**

````ts
import type { RequestHandler } from 'msw'
import { requireNetworkContext } from './network-singleton'

/** Options for {@link mountCore}. Both are optional. */
export interface MountOptions {
  /**
   * Same-origin URI starting with '/', query and hash included (for example
   * /products?filter=bread#detail). Applied with history.pushState
   * before render so the application's router reads it on mount.
   */
  path?: string
  /**
   * MSW handlers of this test's own. Installed with worker.use() before
   * render, so they take priority over the suite's for the same route, and
   * setupNetwork() undoes them in its afterEach.
   */
  network?: RequestHandler[]
}

/** The minimal contract every vitest-browser-* render result satisfies. */
export interface MountResult {
  container: Element
}

function isSameOriginPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  try {
    return new URL(path, location.origin).origin === location.origin
  } catch {
    return false
  }
}

/**
 * Framework-agnostic mount: applies pushState (if path), registers
 * test-specific MSW handlers (if network), then calls render(component).
 *
 * The render function is provided by the caller -- each framework subpath
 * (/react, /vue, /svelte) wraps this with its own vitest-browser-*
 * render. See the "Custom framework adapter" section in the README for
 * building your own.
 *
 * @example
 * ```ts
 * import { render } from 'vitest-browser-lit'
 * import { mountCore } from '@yabbadabbadev/pepito'
 *
 * const screen = await mountCore(MyComponent, (c) => render(c as any))
 * ```
 */
export async function mountCore<T extends MountResult>(
  component: unknown,
  render: (component: unknown) => T | Promise<T>,
  options: MountOptions = {},
): Promise<T> {
  const { worker } = requireNetworkContext('mountCore')
  const { path, network: testHandlers } = options

  if (path !== undefined && !isSameOriginPath(path)) {
    throw new Error(
      "pepito: path must be a same-origin URI that starts with '/'; " +
        'received: ' +
        String(path) +
        '. A different origin is mocked in the MSW ' +
        'handlers, not in the mount.',
    )
  }

  if (path !== undefined) {
    history.pushState({}, '', path)
  }
  if (testHandlers !== undefined && testHandlers.length > 0) {
    worker.use(...testHandlers)
  }

  return await Promise.resolve(render(component))
}
````

- [ ] **Step 3: Verify `src/mount-core.ts` typechecks and lints clean**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors)

- [ ] **Step 4: Update `src/index.ts` core barrel BEFORE deleting mount.ts**

Read the current `src/index.ts`. Replace lines 7-8:

```ts
export { mount } from './mount'
export type { MountOptions } from './mount'
```

with:

```ts
export { mountCore } from './mount-core'
export type { MountOptions, MountResult } from './mount-core'
```

- [ ] **Step 5: Delete `src/mount.ts`**

Run: `rm src/mount.ts`

- [ ] **Step 6: Run typecheck to verify the barrel is clean**

Run: `npm run typecheck`
Expected: errors ONLY in `test/mount.test.tsx` and `test/mount-without-setup.test.tsx` (they import `mount` from `../src` which no longer exports it). All src/ files clean.

Verify the errors are ONLY in those two test files and have the exact message "Module '"../src"' has no exported member 'mount'". If any other files error, fix before continuing.

- [ ] **Step 7: Run existing mount tests -- they WILL fail because `mount` is no longer exported from `src/index.ts`**

Run: `npx vitest run test/mount.test.tsx 2>&1 | tail -20`
Expected: FAIL -- Module '"../src"' has no exported member 'mount'

- [ ] **Step 8: Commit**

```bash
git add src/mount-core.ts src/index.ts && git rm src/mount.ts
git commit -m "refactor: extract generic mountCore from React-specific mount"
```

---

### Task 2: Create `/react` subpath

**Files:**

- Create: `src/react.ts`

**Interfaces:**

- Consumes: `mountCore`, `MountOptions` from `./mount-core`
- Produces: `mount(ui: ReactElement, options?: MountOptions) → Promise<RenderResult>`

- [ ] **Step 1: Create `src/react.ts`**

````ts
import type { ReactElement } from 'react'
import { render, type RenderResult } from 'vitest-browser-react'
import { mountCore } from './mount-core'
import type { MountOptions } from './mount-core'

/**
 * Mounts a React element with vitest-browser-react, optionally on a real
 * document route and with test-specific MSW handlers.
 *
 * path, if given, has to be a same-origin URI starting with '/': it's
 * applied with history.pushState BEFORE render because the application's
 * BrowserRouter reads the URL on mount and only listens to popstate
 * afterwards. The URI can carry query and hash: they flow through the router
 * the same as the path. setupNetwork() restores the original URL in its
 * afterEach, so every test starts from the same route regardless of what
 * the previous one mounted.
 *
 * network, if given, is registered with worker.use() before render: its
 * handlers take priority over the suite's for this request, with the same
 * resolution rules as MSW.
 *
 * @example
 * ```tsx
 * import { mount } from '@yabbadabbadev/pepito/react'
 *
 * const screen = await mount(<App />, { path: '/products?filter=bread' })
 * await expect.element(screen.getByText('filter: bread')).toBeVisible()
 * ```
 */
export async function mount(
  ui: ReactElement,
  options?: MountOptions,
): Promise<RenderResult> {
  return mountCore(ui, (c) => render(c as ReactElement), options)
}
````

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors)

- [ ] **Step 3: Write a temporary smoke test to confirm the import works**

Create `test/react-smoke.test.tsx`:

```tsx
import { mount } from '../src/react'
import './setup'
import { RoutedApp } from './routed-app'

test('react subpath mount works', async () => {
  const screen = await mount(<RoutedApp />)
  await expect.element(screen.getByText('Home page')).toBeVisible()
})
```

Run: `npx vitest run test/react-smoke.test.tsx 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 4: Remove the temporary smoke test file**

```bash
rm test/react-smoke.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/react.ts
git commit -m "feat: add /react subpath with mount wrapper"
```

---

### Task 3: Create `/vue` subpath

**Files:**

- Create: `src/vue.ts`

**Interfaces:**

- Consumes: `mountCore`, `MountOptions` from `./mount-core`
- Produces: `mount(component, options?) → Promise<RenderResult>`

- [ ] **Step 1: Create `src/vue.ts`**

````ts
import { render, type RenderResult } from 'vitest-browser-vue'
import { mountCore } from './mount-core'
import type { MountOptions } from './mount-core'

/**
 * Mounts a Vue component with vitest-browser-vue, optionally on a real
 * document route and with test-specific MSW handlers.
 *
 * path, if given, has to be a same-origin URI starting with '/': it's
 * applied with history.pushState BEFORE render so the application's
 * router reads it on mount. setupNetwork() restores the original URL
 * in its afterEach.
 *
 * network, if given, is registered with worker.use() before render.
 *
 * @example
 * ```ts
 * import { mount } from '@yabbadabbadev/pepito/vue'
 * import App from './App.vue'
 *
 * const screen = await mount(App, { path: '/products' })
 * await expect.element(screen.getByText('Products')).toBeVisible()
 * ```
 */
export async function mount(
  component: Parameters<typeof render>[0],
  options?: MountOptions,
): Promise<RenderResult> {
  return mountCore(
    component,
    (c) => render(c as Parameters<typeof render>[0]),
    options,
  )
}
````

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/vue.ts
git commit -m "feat: add /vue subpath with mount wrapper"
```

---

### Task 4: Create `/svelte` subpath

**Files:**

- Create: `src/svelte.ts`

**Interfaces:**

- Consumes: `mountCore`, `MountOptions` from `./mount-core`
- Produces: `mount(component, options?) → Promise<RenderResult>`

- [ ] **Step 1: Create `src/svelte.ts`**

````ts
import { render, type RenderResult } from 'vitest-browser-svelte'
import { mountCore } from './mount-core'
import type { MountOptions } from './mount-core'

/**
 * Mounts a Svelte component with vitest-browser-svelte, optionally on a
 * real document route and with test-specific MSW handlers.
 *
 * path, if given, has to be a same-origin URI starting with '/': it's
 * applied with history.pushState BEFORE render so the application's
 * router reads it on mount. setupNetwork() restores the original URL
 * in its afterEach.
 *
 * network, if given, is registered with worker.use() before render.
 *
 * @example
 * ```ts
 * import { mount } from '@yabbadabbadev/pepito/svelte'
 * import App from './App.svelte'
 *
 * const screen = await mount(App, { path: '/products' })
 * await expect.element(screen.getByText('Products')).toBeVisible()
 * ```
 */
export async function mount(
  component: Parameters<typeof render>[0],
  options?: MountOptions,
): Promise<RenderResult> {
  return mountCore(
    component,
    (c) => render(c as Parameters<typeof render>[0]),
    options,
  )
}
````

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/svelte.ts
git commit -m "feat: add /svelte subpath with mount wrapper"
```

---

### Task 5: Update `package.json` -- peerDeps and exports map

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Read the current `package.json` to confirm exact peerDependencies and exports**

- [ ] **Step 2: Update `peerDependencies`**

Remove `"react": "^19.0.0"`, `"react-dom": "^19.0.0"`, `"vitest-browser-react": "^2.0.0"`.

The `peerDependencies` block should become:

```json
"peerDependencies": {
  "msw": "^2.15.0",
  "vitest": "^4.0.0"
}
```

- [ ] **Step 3: Update `exports` map**

Replace the `"exports"` block:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./react": {
    "types": "./dist/react.d.ts",
    "default": "./dist/react.js"
  },
  "./vue": {
    "types": "./dist/vue.d.ts",
    "default": "./dist/vue.js"
  },
  "./svelte": {
    "types": "./dist/svelte.d.ts",
    "default": "./dist/svelte.js"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "refactor: drop React peerDeps, add /react /vue /svelte exports"
```

---

### Task 6: Migrate existing mount tests to import from `/react` subpath

**Files:**

- Modify: `test/mount.test.tsx`
- Modify: `test/mount-without-setup.test.tsx`

- [ ] **Step 1: Update `test/mount.test.tsx`**

Change line 2 from:

```ts
import { get, mount } from '../src'
```

to:

```ts
import { get } from '../src'
import { mount } from '../src/react'
```

- [ ] **Step 2: Update `test/mount-without-setup.test.tsx`**

Change line 1 from:

```ts
import { mount } from '../src'
```

to:

```ts
import { mount } from '../src/react'
```

- [ ] **Step 3: Run all mount tests**

Run: `npx vitest run test/mount.test.tsx test/mount-without-setup.test.tsx 2>&1 | tail -15`
Expected: all 7 tests PASS

- [ ] **Step 4: Run the full suite to check nothing regressed**

Run: `npm test 2>&1 | tail -15`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add test/mount.test.tsx test/mount-without-setup.test.tsx
git commit -m "test: migrate mount tests to import from /react subpath"
```

---

### Task 7: Add Vue and Svelte smoke tests

**Files:**

- Create: `test/vue-smoke.test.ts`
- Create: `test/fixtures/HelloWorld.svelte`
- Create: `test/svelte-smoke.test.ts`
- Modify: `vitest.config.ts` (add Svelte plugin)

- [ ] **Step 1: Install Svelte Vite plugin**

```bash
npm install --save-dev @sveltejs/vite-plugin-svelte
```

- [ ] **Step 2: Update `vitest.config.ts`**

Add the Svelte plugin import and registration. Keep the existing `react()` plugin exactly as-is.

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [react(), svelte()],
  test: {
    globals: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
})
```

- [ ] **Step 3: Create `test/fixtures/HelloWorld.svelte`**

```bash
mkdir -p test/fixtures
```

Write `test/fixtures/HelloWorld.svelte`:

```svelte
<script>
  let { name = 'Svelte' } = $props()
</script>

<p>Hello from {name}</p>
```

- [ ] **Step 4: Create `test/vue-smoke.test.ts`**

```ts
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
    network: [http.get('/api/data', () => HttpResponse.json({ ok: true }))],
  })

  await expect.element(screen.getByText('Hello from Vue')).toBeVisible()

  await fetch('/api/data')
  await expect(get('/api/data')).toHaveRespondedWith(200)
})
```

- [ ] **Step 5: Create `test/svelte-smoke.test.ts`**

```ts
import { http, HttpResponse } from 'msw'
import { mount } from '../src/svelte'
import { get } from '../src'
import './setup'
import HelloWorld from './fixtures/HelloWorld.svelte'

test('svelte mount renders the component', async () => {
  const screen = await mount(HelloWorld)
  await expect.element(screen.getByText('Hello from Svelte')).toBeVisible()
})

test('svelte mount with network handlers', async () => {
  const screen = await mount(HelloWorld, {
    network: [http.get('/api/data', () => HttpResponse.json({ ok: true }))],
  })

  await expect.element(screen.getByText('Hello from Svelte')).toBeVisible()

  await fetch('/api/data')
  await expect(get('/api/data')).toHaveRespondedWith(200)
})
```

- [ ] **Step 6: Run Vue and Svelte smoke tests**

Run: `npx vitest run test/vue-smoke.test.ts test/svelte-smoke.test.ts 2>&1 | tail -20`
Expected: all 4 tests PASS (2 per file)

- [ ] **Step 7: Run the full suite**

Run: `npm test 2>&1 | tail -15`
Expected: all tests PASS (previous + 4 new)

- [ ] **Step 8: Commit**

```bash
git add test/vue-smoke.test.ts test/svelte-smoke.test.ts test/fixtures/HelloWorld.svelte vitest.config.ts
git commit -m "test: add Vue and Svelte smoke tests for subpath mounting"
```

---

### Task 8: Update README.md

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Rewrite Section 1 (Install and start) with per-framework subsections**

Replace the entire "1. Install and start" section (from the `## 1. Install and start` heading through the paragraph ending with "raise TS2339 even though the test passes at runtime.") with:

````markdown
## 1. Install and start

`vitest` and `msw` are **peerDependencies**: install them if your project
doesn't already have them.

### Core (any framework)

The core -- `setupNetwork`, matchers, request descriptors, `network.log()` --
works without any framework adapter.

```bash
npm i -D @yabbadabbadev/pepito msw
npx msw init public --save
```

Call `setupNetwork` once, in a `setupFiles` file of `vitest.config`:

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
    browser: {/* ... */},
  },
})
```

### React

```bash
npm i -D @yabbadabbadev/pepito msw vitest-browser-react
npx msw init public --save
```

```tsx
import { mount } from '@yabbadabbadev/pepito/react'
import { App } from '../src/App'

const screen = await mount(<App />, { path: '/products' })
```

### Vue

```bash
npm i -D @yabbadabbadev/pepito msw vitest-browser-vue
npx msw init public --save
```

```ts
import { mount } from '@yabbadabbadev/pepito/vue'
import App from '../src/App.vue'

const screen = await mount(App, { path: '/products' })
```

### Svelte

```bash
npm i -D @yabbadabbadev/pepito msw vitest-browser-svelte
npx msw init public --save
```

```ts
import { mount } from '@yabbadabbadev/pepito/svelte'
import App from '../src/App.svelte'

const screen = await mount(App, { path: '/products' })
```

### Custom framework adapter

If you use a framework without an official subpath (Lit, Preact, Angular,
Solid, ...), build your own adapter with `mountCore`:

```ts
import { render } from 'vitest-browser-lit'
import { mountCore } from '@yabbadabbadev/pepito'

export function mount(
  component: unknown,
  options?: Parameters<typeof mountCore>[2],
) {
  return mountCore(component, (c) => render(c as any), options)
}
```

`mountCore` applies `pushState` for routing and registers test-specific
MSW handlers before calling your `render` function. Its return type is
generic: it infers the full typed result from whatever your `render`
returns.

`setupNetwork`'s second argument passes straight through to
`worker.start()`, with no wrapper of its own -- for example, to make a
request with no handler fail the test instead of just warning on the
console:

```ts
// vitest.setup.ts
import { setupNetwork } from '@yabbadabbadev/pepito'
import { handlers } from './handlers'

setupNetwork(handlers, { onUnhandledRequest: 'error' })
```

Importing anything from `pepito` -- even just `setupNetwork` -- already
brings the network matchers along as `expect` types: there's no separate
type registration. If your test `tsconfig` doesn't include the setup
file, `tsc` won't see the augmentation and
`expect(...).toHaveBeenRequested()` will raise `TS2339` even though the
test passes at runtime.
````

- [ ] **Step 2: Update Section 2 (Mount) -- change imports to use the React subpath**

Throughout Section 2, change every:

```
import { mount } from '@yabbadabbadev/pepito'
```

to:

```
import { mount } from '@yabbadabbadev/pepito/react'
```

Keep the `BrowserRouter` reference -- it's React-specific documentation that belongs in the section about the React subpath.

- [ ] **Step 3: Update the text at the start of Section 2**

Current opening paragraph:

> `mount` mounts with `vitest-browser-react` and returns its `screen`
> unwrapped. It requires `setupNetwork` to have run first (section 1), **even
> for a test with no network**: the coupling is deliberate -- `mount` also
> installs URL and storage cleanup between tests, not just the network -- and
> if it's missing, it fails immediately with a fix instruction.

Replace with:

> `mount` (from `@yabbadabbadev/pepito/react`) mounts with
> `vitest-browser-react` and returns its `screen` unwrapped. It requires
> `setupNetwork` to have run first (section 1), **even for a test with no
> network**: the coupling is deliberate -- `mount` also installs URL and
> storage cleanup between tests, not just the network -- and if it's missing,
> it fails immediately with a fix instruction.

- [ ] **Step 4: Verify the full suite still passes**

Run: `npm test 2>&1 | tail -5`
Expected: all tests PASS (README changes are docs-only, no code impact)

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: framework-agnostic install, subpath examples, custom adapter recipe"
```

---

### Task 9: Update ROADMAP.md

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Add the framework decoupling entry**

Insert a new row right after the "Provenance publishing" entry (the last "Done" item):

```
| Framework decoupling                                         | **Done** -- \`mount\` extracted to subpath exports (\`/react\`, \`/vue\`, \`/svelte\`); core is framework-agnostic and \`mountCore\` exposed for custom adapters. \`react\`, \`react-dom\` and \`vitest-browser-react\` removed from \`peerDependencies\`.                                                                                  |
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: record framework decoupling in roadmap"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run the full quality harness**

```bash
npm run typecheck && npm run lint && npm run format:check && npm run coverage
```

Expected: all four PASS (0 type errors, 0 lint warnings, Prettier clean, 90/90 coverage)

- [ ] **Step 2: Run the full test suite in verbose mode for visual inspection**

```bash
npm test 2>&1
```

Expected: all tests PASS

- [ ] **Step 3: Verify the build output contains all subpath files**

```bash
npm run build && ls dist/*.js dist/*.d.ts | grep -E 'mount-core|react|vue|svelte'
```

Expected: `dist/mount-core.js`, `dist/mount-core.d.ts`, `dist/react.js`, `dist/react.d.ts`, `dist/vue.js`, `dist/vue.d.ts`, `dist/svelte.js`, `dist/svelte.d.ts`

- [ ] **Step 4: Final git status check**

```bash
git status
```

Expected: clean working tree, all changes committed.
