import { setupNetwork } from '../src'
import { suiteHandlers } from './suite-handlers'

export const worker = setupNetwork(suiteHandlers)
