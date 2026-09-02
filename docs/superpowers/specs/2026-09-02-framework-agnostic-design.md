# Framework-agnostic core + subpath adapters

Design spec for making `@yabbadabbadev/pepito` framework-agnostic.

## Motivation

Today `pepito` is tied to React through a single file (`src/mount.ts`), which
imports `vitest-browser-react` and takes `ReactElement`. The other 12 source
files are already framework-agnostic — they operate on the MSW traffic
registry, the browser URL, and browser storage, none of which depends on React.

`vitest-browser-*` adapters exist for Vue, Svelte, Angular, Lit, and Preact
— all with the same `render(component)` → `screen` contract. This design
extracts the React-specific `mount` into a subpath export, keeps the core
clean, and ships first-party adapters for the three frameworks whose
`vitest-browser-*` is maintained by the Vitest team (React, Vue, Svelte).

## Exports map

```
@yabbadabbadev/pepito          → core: matchers, setupNetwork, network, descriptors,
                                 mountCore, MountOptions
@yabbadabbadev/pepito/react    → mount (ReactElement) using vitest-browser-react
@yabbadabbadev/pepito/vue      → mount (Vue component) using vitest-browser-vue
@yabbadabbadev/pepito/svelte   → mount (Svelte component) using vitest-browser-svelte
```

## Source layout

```
src/
  index.ts              → core barrel (no mount, no MountOptions → adds mountCore)
  mount-core.ts         → renamed from mount.ts, unknown + render function
  react.ts              → subpath /react
  vue.ts                → subpath /vue
  svelte.ts             → subpath /svelte
  (the rest untouched)
```

## API: mountCore

```ts
export interface MountOptions {
  path?: string
  network?: RequestHandler[]
}

export interface MountResult {
  container: Element
}

export function mountCore(
  component: unknown,
  render: (component: unknown) => MountResult | Promise<MountResult>,
  options?: MountOptions,
): Promise<MountResult>
```

`mountCore` applies `pushState` (if `path`), `worker.use(...)` (if `network`),
then calls `render(component)`. `isSameOriginPath` lives here — it was already
framework-agnostic.

## API: subpaths

Each subpath is a ~10-line file that imports its `vitest-browser-*` and wraps
`mountCore`:

```ts
// react.ts
import { render } from 'vitest-browser-react'
import type { RenderResult } from 'vitest-browser-react'
import type { ReactElement } from 'react'
import { mountCore } from './mount-core'

export async function mount(
  ui: ReactElement,
  options?: MountOptions,
): Promise<RenderResult> {
  return mountCore(ui, c => render(c as ReactElement), options) as Promise<RenderResult>
}
```

The subpath preserves the native return type of its `vitest-browser-*` so the
consumer sees `getByRole`, `getByText`, etc. fully typed.

`vue.ts` and `svelte.ts` follow the same pattern with their respective `render`.

## Dependencies

**peerDependencies — core:** `msw`, `vitest` (unchanged). `react`, `react-dom`,
`vitest-browser-react` removed.

**peerDependencies — subpaths:** none. If a consumer imports `/react` without
`vitest-browser-react` installed, the module resolver gives the error. Same
for `/vue` and `/svelte`.

**devDependencies:** add `vitest-browser-vue` + `vue`,
`vitest-browser-svelte` + `svelte` for subpath tests. Keep existing React
devDeps and `@vitejs/plugin-react` for the `/react` subpath tests.

**eslint:** keep React plugins while the repo has `.tsx` test files.

## Migration

`mount.ts` is renamed to `mount-core.ts` with signature changes. The existing
React-specific mount code becomes `react.ts`. `index.ts` drops `mount`/`MountOptions`
and adds `mountCore`/`MountOptions`.

Existing mount tests move to the `/react` test suite unchanged. Smoke tests
added for `/vue` and `/svelte` (mount + one matcher assertion).

## Documentation

README Section 1 ("Install") split into sub-sections per framework, each with its
install command and a short example using the subpath import.

New section "Custom framework adapter" showing `mountCore` usage with
`vitest-browser-lit`.

Section 2 ("Mount") examples updated from `'@yabbadabbadev/pepito'` to
`'@yabbadabbadev/pepito/react'`. Reference to `BrowserRouter` stays in the React
sub-section — it's framework knowledge, not core.

Sections 3–7 ("Assert a request" through "Recipes") unchanged — already
framework-agnostic.

ROADMAP.md gets a new entry describing the decoupling.

## Out of scope

- Angular, Lit, Preact adapters (can be community-contributed via `mountCore`)
- Workspaces/monorepo split
- Dedicated `@types/` package for `MountResult`