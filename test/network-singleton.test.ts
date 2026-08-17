import { requireNetworkContext } from '../src/network-singleton'

// Este fichero NUNCA llama a setupNetwork: cada fichero de test tiene su
// propia instancia de módulo en browser mode, así que es el sitio correcto
// para probar la guarda sin contaminar los tests que sí inicializan la red.
test('pedir el contexto sin setupNetwork lanza con la instrucción de arreglo', () => {
  expect(() => requireNetworkContext('mount')).toThrow(
    /setupNetwork\(handlers\) no se ha inicializado.*mount/s,
  )
})
