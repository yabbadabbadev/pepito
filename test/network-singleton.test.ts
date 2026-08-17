import { requireNetworkContext } from '../src/network-singleton'

// This file NEVER calls setupNetwork: each test file has its own module
// instance in browser mode, so this is the right place to test the guard
// without contaminating the tests that do initialize the network.
test('asking for the context without setupNetwork throws with the fix instruction', () => {
  expect(() => requireNetworkContext('mount')).toThrow(
    /setupNetwork\(handlers\) has not been initialized.*mount/s,
  )
})
