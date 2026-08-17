# pepito

Utilidades de test de red para Vitest browser mode: monta la aplicación con
`mount` y asierta sobre el tráfico observado por MSW con matchers de
`expect`. No abstrae MSW — los handlers se declaran con `http.get(...)` de
siempre — solo aporta el arranque, el registro del tráfico y los matchers
para consultarlo.

Se publica en npm como `@yabbadabbadev/pepito`; `pepito` sigue siendo el
code-name del proyecto y el nombre de este directorio. Ver `CONTRIBUTING.md`
para ejecutar los tests y publicar una versión, y `ROADMAP.md` para lo que
queda fuera de esta versión.

## 1. Instalar y arrancar

`react`, `react-dom`, `vitest`, `msw` y `vitest-browser-react` son
**peerDependencies**: instálalas si tu proyecto no las trae ya.

```bash
npm i -D @yabbadabbadev/pepito msw vitest-browser-react
npx msw init public --save
```

`npx msw init public --save` genera el service worker que MSW necesita en
browser mode (`public/mockServiceWorker.js`); es un one-off, no un paso del
día a día — se repite solo al subir de versión de MSW.

Llama a `setupNetwork` una vez, en un fichero de `setupFiles` de
`vitest.config` — nunca dentro de un test:

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

El segundo argumento de `setupNetwork` pasa tal cual a `worker.start()`, sin
envoltorio propio — por ejemplo, para que una petición sin handler tire el
test en vez de solo avisar por consola:

```ts
// vitest.setup.ts
import { setupNetwork } from '@yabbadabbadev/pepito'
import { handlers } from './handlers'

setupNetwork(handlers, { onUnhandledRequest: 'error' })
```

Importar cualquier cosa de `pepito` —aquí, `setupNetwork`— ya trae consigo
los matchers de red como tipos de `expect`: no hay un registro de tipos
aparte. Si tu `tsconfig` de test no incluye el fichero de setup, `tsc` no verá
la augmentación y `expect(...).toHaveBeenRequested()` dará `TS2339` aunque el
test pase en tiempo de ejecución.

## 2. Montar la aplicación

`mount` monta con `vitest-browser-react` y devuelve su `screen` sin envolver.
Requiere que `setupNetwork` haya corrido antes (sección 1), **también para un
test sin red**: el acoplamiento es deliberado — `mount` instala la limpieza de
URL y almacenamiento entre tests además de la red — y si falta, falla en el
momento con la instrucción de arreglo.

```tsx
import { http, HttpResponse } from 'msw'
import { mount, get } from '@yabbadabbadev/pepito'
import { App } from '../src/App'
import { ProductListMother } from '../test/mothers/product-list-mother'

test('la página de catálogo pinta el filtro de la URL', async () => {
  const screen = await mount(<App />, {
    path: '/products?filtro=pan',
    network: [
      http.get('/api/products', () =>
        HttpResponse.json(ProductListMother.catalog()),
      ),
    ],
  })

  await expect.element(screen.getByText('filtro: pan')).toBeVisible()
  await expect(get('/api/products')).toHaveBeenRequested()
})
```

`path` es una URI **completa** same-origin que empieza por `/` — query y hash
incluidos — porque el router de tu aplicación (`BrowserRouter` o el que sea)
la lee de la URL real del documento, no de un `MemoryRouter`. Un origen
distinto no es un `path` válido: se mockea en los `handlers`, no en el
montaje — ver la sección 7.

`network` son handlers de MSW propios de este test: entran con `worker.use()`
antes del render, así que ganan a los de la suite para la misma ruta, y
`setupNetwork()` los deshace después en su `afterEach`. Ninguna de las dos
opciones es obligatoria — `mount(<App />)` a secas monta y punto:

```tsx
import { mount } from '@yabbadabbadev/pepito'
import { App } from '../src/App'

test('monta sin path ni network propios', async () => {
  const screen = await mount(<App />)

  await expect.element(screen.getByText('Catálogo de productos')).toBeVisible()
})
```

`path` puede llevar query y hash a la vez, porque los dos atraviesan el
router igual que el resto de la URI:

```tsx
const screen = await mount(<App />, { path: '/products?filtro=pan#detalle' })

await expect.element(screen.getByText('filtro: pan')).toBeVisible()
await expect.element(screen.getByText('hash: #detalle')).toBeVisible()
```

## 3. Asertar una petición

```ts
import { get, post } from '@yabbadabbadev/pepito'

await expect(get('/api/products')).toHaveBeenRequested()
await expect(get('/api/products')).toHaveBeenRequestedTimes(2)
await expect(post('/api/products')).not.toHaveBeenRequested()
```

`get`, `post`, `put`, `patch`, `del` y `query` describen la petición esperada
— los seis son atajos de `request(método, path)` con el método ya fijado.
Para cualquier otro método usa `request(método, path)` directamente: es la
escotilla que cubre incluso los que MSW 2.15 todavía no expone como helper de
handler:

```ts
import { del, patch, put, query, request } from '@yabbadabbadev/pepito'

await expect(
  put('/api/products/1', { body: { product_name: 'Leche entera' } }),
).toHaveBeenRequested()
await expect(
  patch('/api/products/1', { body: { stock: 3 } }),
).toHaveBeenRequested()
await expect(del('/api/products/1')).toHaveBeenRequested()
await expect(
  query('/api/products', { searchParams: { filtro: 'pan' } }),
).toHaveBeenRequested()
await expect(request('OPTIONS', '/api/products')).toHaveBeenRequested()
```

Body y `searchParams` casan por **subconjunto**:

```ts
import { get, post } from '@yabbadabbadev/pepito'

await expect(
  get('/api/products', { searchParams: { filtro: 'pan' } }),
).toHaveBeenRequested()
await expect(
  post('/api/products', { body: { product_name: 'Leche entera' } }),
).toHaveBeenRequested()
```

`post('/api/products', { body: { product_name: 'Leche entera' } })` casa
aunque la petición real lleve además `id`. Pásale `{ exact: true }` cuando
necesites igualdad estricta de todo el objeto, no solo de las claves que
listes en `body`:

```ts
await expect(
  post('/api/products', {
    body: { product_name: 'Leche entera' },
    exact: true,
  }),
).toHaveBeenRequested()
```

Una clave de `searchParams` repetida en la URL real (`?tag=a&tag=b`) se
colapsa a su último valor antes de comparar — el matcher no puede distinguir
esa petición de una con la clave una sola vez.

Los matchers reintentan porque una petición es un efecto posterior a la
interacción, igual que `expect.element` — no hace falta envolverlos en un
`waitFor`. `.not.toHaveBeenRequested()` y `toHaveBeenRequestedTimes` son la
excepción: antes de decidir esperan a que la red se quede en calma, para no
confundir una petición que aún no ha llegado con una que nunca se hizo.

## 4. Interceptada o escapada

`toHaveBeenRequested` y `toHaveBeenIntercepted` afirman cosas distintas:

| Matcher                 | Qué afirma                           |
| ----------------------- | ------------------------------------ |
| `toHaveBeenRequested`   | La aplicación hizo la petición       |
| `toHaveBeenIntercepted` | Un handler tuyo produjo la respuesta |

Un handler con `passthrough()` cumple el primero y no el segundo: la
respuesta vino de la red real, no de tu mock.

```ts
import { http, passthrough } from 'msw'
import { get } from '@yabbadabbadev/pepito'

// handler: http.get('/api/legado', () => passthrough())

await fetch('/api/legado')

await expect(get('/api/legado')).toHaveBeenRequested() // pasa
await expect(get('/api/legado')).toHaveBeenIntercepted() // falla
```

Para pillar lo que ni siquiera tiene handler, el guardarraíl de suite:

```ts
await expect.network().toHaveNoUnhandledRequests()
```

`toHaveNoUnhandledRequests` cuelga de `expect.network()`, no de un descriptor
de petición, porque no describe una petición concreta sino todo el tráfico
observado.

## 5. Qué respondió el mock

```ts
import { get } from '@yabbadabbadev/pepito'

await expect(get('/api/products')).toHaveRespondedWith(500)

await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: { total: 2 },
})
```

El número a secas es el atajo de `{ status }`. El `body`, si se da, casa por
subconjunto igual que en los descriptores de petición — `{ exact: true }`
para igualdad estricta:

```ts
import { get } from '@yabbadabbadev/pepito'
import { ProductListMother } from '../test/mothers/product-list-mother'

await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: ProductListMother.catalog(),
  exact: true,
})
```

`toHaveRespondedWith` exige además que la petición haya sido interceptada: una
respuesta real vía `passthrough()` nunca cuenta, aunque el status case por
casualidad.

## 6. Depurar cuando falla

Los mensajes de fallo llevan el tráfico completo observado y un diff en color
(`this.utils` de Vitest, el mismo que usan los matchers nativos — nada de
dependencias nuevas):

```
expect(received).toHaveBeenRequested(expected)

Esperaba: Object {
  "body": undefined,
  "method": "GET",
  "path": "/api/products",
  "searchParams": Object {
    "filtro": "chocolate",
  },
}

- Expected
+ Received

  {
    "body": undefined,
    "searchParams": {
-     "filtro": "chocolate",
+     "filtro": "pan",
    },
  }

Tráfico observado:
  GET /api/products?filtro=pan → 200 [matched/mocked]
```

(salida real, capturada sin color; en tu terminal `- Expected`/`+ Received`
llegan en verde y rojo)

Para mirar el tráfico sin que nada falle, en medio de un test que estás
depurando:

```ts
import { network } from '@yabbadabbadev/pepito'

await fetch('/api/products')
await network.log() // vuelca method, path, body y status por consola
```

Si el mensaje de fallo no explica lo que esperabas, es un defecto del
matcher, no algo que compensar a mano: los mensajes de fallo son parte del
producto y se testean como cualquier otra salida (ver `CONTRIBUTING.md`).

## 7. Recetas

**Respuestas distintas en llamadas sucesivas.** No hace falta ninguna API de
`pepito` para esto: es MSW puro, con handlers encadenados. El primero que casa
gana, y si lleva `{ once: true }` se desactiva después de esa primera vez, así
que la petición cae al siguiente handler de la lista:

```tsx
import { http, HttpResponse } from 'msw'
import { get, mount } from '@yabbadabbadev/pepito'
import { App } from '../src/App'
import { ProductListMother } from '../test/mothers/product-list-mother'

test('la segunda visita ya ve el catálogo cacheado', async () => {
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

  await fetch('/api/products') // 1ª: el handler once responde y se agota
  await fetch('/api/products') // 2ª: cae al handler de abajo
  await fetch('/api/products') // 3ª: el de abajo no es once, sigue respondiendo

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

Verificado en este repo: primera llamada → catálogo vacío, segunda y tercera →
catálogo completo (X→Y→Y). `setupNetwork()` deshace los handlers de test en su
`afterEach` con `worker.resetHandlers()`, así que cada test siguiente vuelve a
ver el `once` fresco, sin agotar entre tests.

Cada `toHaveRespondedWith` de arriba encuentra su propia entrada del registro
— uno casa con la respuesta vacía, el otro con el catálogo — sin importar en
qué orden se escriban los `expect`. Lo que `pepito` no tiene todavía es un
matcher que afirme el ORDEN entre dos peticiones idénticas (por ejemplo, "la
vacía antes que el catálogo"): queda en `ROADMAP.md`, porque el registro ya es
cronológico y solo falta exponerlo.

Para secuencias más raras que un `once` no expresa bien (tres respuestas
distintas, o una condición que no es "la primera vez"), el closure con
contador declarado dentro del propio test es la alternativa — sin tocar
`pepito`:

```ts
test('tres respuestas distintas para la misma ruta', async () => {
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

**Sembrar `localStorage`/cookies antes de montar.** El almacenamiento del
navegador es real; no hace falta una opción de `mount` para esto, un
`setItem` normal antes del `await mount(...)` basta:

```ts
test('el catálogo respeta el filtro guardado', async () => {
  localStorage.setItem('filtroFavorito', 'pan')
  document.cookie = 'sesion=abc'

  const screen = await mount(<App />)

  await expect.element(screen.getByText('filtro: pan')).toBeVisible()
})
```

**Fixtures con Mothers.** Los payloads de las respuestas mockeadas siguen el
patrón Mother/Builder de la casa — cada Mother modela la forma de la
respuesta de un endpoint, con factorías con nombre para sus variantes; nada
de literales sueltos ni `structuredClone` con mutación, tampoco en los
ejemplos que se copian de aquí:

```ts
// test/mothers/product-list-mother.ts
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
```

```ts
http.get('/api/products', () => HttpResponse.json(ProductListMother.catalog()))
```

Un payload incidental que no es una entidad (`{ ok: true }`) no necesita
Mother. `pepito` no exporta infraestructura de fixtures — los Mothers son del
dominio de cada proyecto.

**El host del API va en el handler, no en la configuración.** No hay
`defaultHost`: el service worker intercepta cross-origin igual que
same-origin, así que el host es un detalle de la URL del handler.

```ts
http.get('https://api.miempresa.com/products', () =>
  HttpResponse.json(ProductListMother.catalog()),
)
// o con comodín:
http.get('*/products', () => HttpResponse.json(ProductListMother.catalog()))
```

`mount({ path })`, en cambio, sí exige same-origin — un origen distinto ahí
lanza con instrucción, porque el `path` mueve la URL del documento de test,
no la petición que quieres mockear.

**Esperar la calma de la red antes de capturar.** El estabilizador nativo de
`toMatchScreenshot` espera a que el frame deje de cambiar, pero un
`<p>Cargando…</p>` estático también es una captura estable: sin esperar a la
red, la baseline es la pantalla de carga, no el contenido real. Medido en
`docs/knowledge/regresion-visual-browser-mode.md`: 0 fallos en 17 ejecuciones
locales + 3 en CI esperando la calma así, con baselines byte-idénticas a las
que ancla `expect.element` a un texto concreto. `network.idle()` espera con
el mismo mecanismo que los matchers de red, sin asertar nada:

```tsx
import { mount, network } from '@yabbadabbadev/pepito'
import { App } from '../src/App'

test('el catálogo no cambia visualmente', async () => {
  const screen = await mount(<App />)

  await network.idle()

  await expect.element(screen.getByRole('main')).toMatchScreenshot('catalogo')
})
```

## 8. Chuleta

```ts
request('QUERY', '/api/products') // cualquier método, incluidos los que no tienen atajo
get('/api/products', { searchParams: { filtro: 'pan' } }) // subconjunto de searchParams
post('/api/products', { body: { product_name: 'Leche' } }) // subconjunto de body
put('/api/products/1', { body: { stock: 3 }, exact: true }) // igualdad estricta
patch('/api/products/1', { body: { stock: 3 } })
del('/api/products/1')
query('/api/products', { searchParams: { filtro: 'pan' } })

await expect(get('/api/products')).toHaveBeenRequested() // la app hizo la petición
await expect(get('/api/products')).not.toHaveBeenRequested() // espera la calma antes
await expect(get('/api/products')).toHaveBeenRequestedTimes(2) // conteo exacto, red en calma
await expect(get('/api/products')).toHaveBeenIntercepted() // un handler propio respondió
await expect(get('/api/products')).toHaveRespondedWith(500) // atajo de { status: 500 }
await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: { total: 2 }, // subconjunto
})
await expect(get('/api/products')).toHaveRespondedWith({
  status: 200,
  body: { total: 2 },
  exact: true, // igualdad estricta
})
await expect.network().toHaveNoUnhandledRequests() // guardarraíl: nada sin handler
await network.log() // vuelca el tráfico observado, sin asertar
await network.idle() // espera la calma, sin asertar — antes de capturar en regresión visual
```
