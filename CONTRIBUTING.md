# Contribuir a pepito

## Ejecutar los tests

La primera vez, instala el navegador que usa browser mode:

```bash
npm run setup
```

Desde `pepito/`:

```bash
npm test               # vitest run, headless, toda la suite
npm run test:watch     # modo watch
npm run test:verbose   # necesario para ver console.log (network.log(), etc.)
npm run coverage       # vitest run --coverage
npm run typecheck      # tsc --noEmit
```

Para un fichero o un test concreto, pasa argumentos al script en vez de
invocar `vitest` directamente: `npm test -- test/mount.test.tsx` o
`npm test -- -t 'nombre del test'`.

Antes de un PR, además, desde la raíz del repo (cubre `pepito/` y el resto):

```bash
npm run lint
npm run format:check
```

## Regenerar el paquete para experiments/

`experiments/` no depende de `pepito/src` directamente: consume el tgz que
genera `npm pack`, para probar contra lo que instalaría alguien de fuera, no
contra el código fuente. Cualquier cambio en `src/` lo deja obsoleto, y hay
que reconstruirlo a mano:

```bash
mkdir -p dist-pack   # npm pack no lo crea solo: sin este paso falla con ENOENT
npm run pack:local
git add -f dist-pack/yabbadabbadev-pepito-0.1.0.tgz   # dist-pack/ está en .gitignore a propósito
cd ../experiments
npm i   # refresca el lockfile con la integridad del tgz nuevo
```

El tgz se commitea a propósito (`git add -f`, saltándose el `.gitignore`):
`experiments/` lo instala como si fuera un paquete publicado, y sin fijarlo en
el repo cada clon del repo tendría que reconstruirlo antes de poder correr esa
suite.

## El arnés de calidad

Este paquete es el que se piensa hacer público, así que el listón es que un
humano ajeno pueda colaborar en él, no que compile. Lo que un PR tiene que
cumplir:

- **TDD, y que se note.** Rojo, verde, refactor, en ese orden. El PR debe
  dejar ver el ciclo en los commits — no vale escribir la implementación
  primero y añadirle tests después para rellenar el expediente. Un test que
  nunca ha fallado no prueba nada.
- **Cobertura mínima del 90% en líneas y ramas** sobre `src/`, comprobada con
  `npm run coverage`. Si el umbral estorba en un caso concreto, se discute en
  el PR; no se baja en silencio.
- **`tsc --noEmit` sin errores**, con `strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals` y `noUnusedParameters` — vienen ya activados en
  `tsconfig.json`, no hay que configurarlos.
- **ESLint con 0 warnings y Prettier limpio**, para todo el repo, no solo para
  `pepito/`.
- **Los mensajes de fallo de los matchers son parte del producto.** Un cambio
  en `failure-messages.ts` o en el texto de un `throw` necesita su propio test
  que compruebe el mensaje, igual que cualquier otra salida — no es
  incidental a la lógica que falla.
- **Los fixtures de las respuestas mockeadas siguen el patrón Mother/Builder**
  de la casa: cada Mother modela la forma de la respuesta de un endpoint, con
  factorías con nombre para sus variantes. Nada de literales con spread ni de
  `structuredClone` con mutación, ni en los tests ni en los ejemplos de
  documentación — que es de donde la gente copia. Un payload incidental que no
  es una entidad (`{ ok: true }`) no necesita Mother.
- **Cuatro señales de código que no se aceptan**: comentarios que repiten el
  código en vez de explicar el porqué, nombres genéricos (`data`, `result`,
  `handler`...), abstracción por si acaso sin caso de uso real, y uniformidad
  sospechosa (secciones vacías, ficheros clonados sin contenido propio).
- **TSDoc en todo lo exportado**, con al menos un ejemplo ejecutable en
  `setupNetwork`, `mount` y los cinco matchers.

## Qué se espera de un PR

- Test primero: el PR debe poder leerse como rojo → verde → refactor, no como
  una implementación con tests pegados al final.
- Si cambias un mensaje de fallo o añades uno nuevo, el test que lo cubre va
  en el mismo PR.
- Si el cambio toca una API pública, actualiza también el TSDoc del símbolo y,
  si aplica, el `README.md` — orientado a tareas, no a la firma de la
  función.
- Los fixtures de ejemplo usan Mothers, no literales sueltos.
- Nada del nombre del paquete (`@yabbadabbadev/pepito`) se filtra a los
  imports de los tests del propio paquete: van por ruta relativa (`../src`),
  para que un cambio de nombre siga costando un `sed`.

## Publicar una versión

La publicación corre en CI (`.github/workflows/publicar-pepito.yml`), no a
mano: el workflow repite la misma verificación que el PR (tests, typecheck,
build) contra el ref exacto que se publica, y añade `--provenance`, que un
`npm publish` local no puede dar.

### Preparación (una vez, desde cualquier máquina)

1. En npmjs.com, crea un token granular: **Read and write**, con acceso a
   `@yabbadabbadev/pepito` o al scope entero si va a haber más paquetes, y
   tipo **automation** — es el tipo que se salta el OTP interactivo, sin el
   cual el job de CI se quedaría bloqueado esperando un 2FA que nadie puede
   teclear.
2. Guárdalo como secret:

   ```bash
   gh secret set NPM_TOKEN --repo yabbadabbadev/vitest-browser-mode-msw
   ```

   O como secret de organización desde la UI de GitHub si va a servir para
   más paquetes del scope, no solo para este.

### Publicar

1. Sube la versión en `pepito/package.json` y añade la entrada correspondiente
   en el CHANGELOG, por PR normal — los gates de siempre (tests, typecheck,
   cobertura, lint) corren solos.
2. Tras el merge, crea y empuja el tag:

   ```bash
   git tag pepito-vX.Y.Z
   git push origin pepito-vX.Y.Z
   ```

   El workflow se dispara con el tag, repite la verificación (tests,
   typecheck, build), comprueba que el tag case con la versión de
   `package.json` y publica con `--provenance`.

Alternativa sin tag: lanzar el workflow `publicar-pepito` a mano desde la UI
de Actions (`workflow_dispatch`) — publica lo que haya en `package.json` en el
ref que elijas, sin la comprobación de tag.

### Manual (alternativa sin CI)

Solo si Actions no está disponible. Desde una máquina limpia:

```bash
cd pepito
npm ci
npm run setup && npm test && npm run typecheck && npm run build
npm pack --dry-run    # audita el tarball: dist/, README.md, CHANGELOG.md, LICENSE, package.json
npm login             # pide 2FA/OTP si la cuenta lo tiene activado
npm publish           # el access público ya va en publishConfig, no hace falta --access
npm view @yabbadabbadev/pepito   # verificación post-publish contra el registry, no contra el local
```

### Post-publicación

Referencia para cuando haya un consumidor real: en `vbmmsw-consumer`, la
dependencia pasa de `file:vendor/...` (el tgz vendorizado) a la versión
publicada en el registry (`"@yabbadabbadev/pepito": "^0.1.0"`) y `vendor/` se
borra — deja de hacer falta una vez que el paquete resuelve desde npm. Ese
cambio se hace en `vbmmsw-consumer`, no aquí; se documenta en este repo porque
es el paso que sigue a esta publicación.
