import { formatTraffic } from '../src/failure-messages'
import type { ResolvedRequest } from '../src/traffic-registry'

// Shape an entry has right after recordRequestStart(): no verdict (no flag
// true) and no response (status null). No need to go through MSW to
// produce it — it's the same shape traffic-registry.ts documents, so it's
// built by hand.
const inFlightEntry: ResolvedRequest = {
  requestId: 'r1',
  method: 'GET',
  origin: 'http://localhost',
  path: '/api/lenta',
  searchParams: {},
  matched: false,
  mocked: false,
  bypassed: false,
  unhandled: false,
  status: null,
  body: undefined,
  responseBody: undefined,
}

test('with no traffic observed, the dump says so instead of showing an empty list', () => {
  expect(formatTraffic([])).toBe('  (no traffic observed)')
})

test('a request still in flight is dumped as "no verdict" and "(no response)"', () => {
  const line = formatTraffic([inFlightEntry])

  expect(line).toContain('[no verdict]')
  expect(line).toContain('(no response)')
})
