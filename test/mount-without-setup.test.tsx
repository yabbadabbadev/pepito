import { mount } from '../src'
import { RoutedApp } from './routed-app'

test('mount without setupNetwork fails with the fix instruction', async () => {
  await expect(mount(<RoutedApp />)).rejects.toThrow(
    /setupNetwork\(handlers\) has not been initialized/,
  )
})
