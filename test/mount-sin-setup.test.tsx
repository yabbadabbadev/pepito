import { mount } from '../src'
import { RoutedApp } from './routed-app'

test('mount sin setupNetwork falla con la instrucción de arreglo', async () => {
  await expect(mount(<RoutedApp />)).rejects.toThrow(
    /setupNetwork\(handlers\) has not been initialized/,
  )
})
