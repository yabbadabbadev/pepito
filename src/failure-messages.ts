import type { MatcherState } from '@vitest/expect'
import type { ExpectedResponse } from './matcher-types'
import type { RequestSpec } from './request-descriptors'
import { matchesSpec } from './spec-matching'
import type { ResolvedRequest } from './traffic-registry'

const TRAFFIC_FLAGS = ['matched', 'mocked', 'bypassed', 'unhandled'] as const

function formatQuery(searchParams: Record<string, string>): string {
  const query = new URLSearchParams(searchParams).toString()
  return query ? `?${query}` : ''
}

function formatFlags(entry: ResolvedRequest): string {
  const activeFlags = TRAFFIC_FLAGS.filter((flag) => entry[flag])
  return activeFlags.length > 0 ? activeFlags.join('/') : 'no verdict'
}

function formatTrafficLine(entry: ResolvedRequest): string {
  const status = entry.status ?? '(no response)'
  return `  ${entry.method} ${entry.path}${formatQuery(entry.searchParams)} → ${status} [${formatFlags(entry)}]`
}

/** Dumps the observed traffic, one line per entry, to embed in a failure message. */
export function formatTraffic(traffic: ResolvedRequest[]): string {
  if (traffic.length === 0) return '  (no traffic observed)'
  return traffic.map(formatTrafficLine).join('\n')
}

// Only what identifies the expected request, not the comparison options
// (`exact`): that's a mode of matchesSpec, not something one "expected to
// receive".
function describeSpec(spec: RequestSpec): Record<string, unknown> {
  return {
    method: spec.method,
    path: spec.path,
    searchParams: spec.searchParams,
    body: spec.body,
  }
}

/**
 * Composes the network matchers' failure message: the matcher's hint, what
 * was expected, a diff against the closest candidate (same method and path,
 * even if it doesn't fully match) if one exists, and the full dump of the
 * observed traffic.
 */
export function requestFailureMessage(messageContext: {
  utils: MatcherState['utils']
  matcherName: string
  spec: RequestSpec
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, matcherName, spec, traffic, isNot } = messageContext

  const sections = [
    utils.matcherHint(matcherName, undefined, undefined, { isNot }),
    // Under `.not`, what failed is that there WAS a matching request: the
    // hint already says so with the "not.", but the "Expected" line by
    // itself would still read as the positive case if it didn't change
    // along with it.
    isNot
      ? `Not expected: ${utils.printExpected(describeSpec(spec))}`
      : `Expected: ${utils.printExpected(describeSpec(spec))}`,
  ]

  const candidate = traffic.find(
    (entry) => entry.method === spec.method && entry.path === spec.path,
  )
  if (candidate) {
    const diff = utils.diff(
      { searchParams: spec.searchParams, body: spec.body },
      { searchParams: candidate.searchParams, body: candidate.body },
    )
    if (diff) sections.push(diff)
  }

  sections.push(`Observed traffic:\n${formatTraffic(traffic)}`)

  return sections.join('\n\n')
}

/**
 * Composes the `toHaveBeenRequestedTimes` failure message: there's no
 * "closest candidate" to show like in `requestFailureMessage`, but an
 * expected count against the one actually observed, plus the full dump.
 */
export function requestCountFailureMessage(messageContext: {
  utils: MatcherState['utils']
  spec: RequestSpec
  expectedCount: number
  foundCount: number
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, spec, expectedCount, foundCount, traffic, isNot } =
    messageContext

  // Under `.not`, `foundCount` is necessarily equal to `expectedCount` (that's
  // what made the negated assertion fail): a bare "found 2" would read as a
  // meaningless echo if it didn't also say that count is exactly the one
  // that wasn't expected.
  const leadLine = isNot
    ? `Did not expect exactly ${expectedCount} request(s) to ${utils.printExpected(describeSpec(spec))}, yet found ${foundCount}`
    : `Expected ${expectedCount} request(s) to ${utils.printExpected(describeSpec(spec))}, found ${foundCount}`

  const sections = [
    utils.matcherHint('toHaveBeenRequestedTimes', undefined, undefined, {
      isNot,
    }),
    leadLine,
    `Observed traffic:\n${formatTraffic(traffic)}`,
  ]

  return sections.join('\n\n')
}

/**
 * Composes the `toHaveNoUnhandledRequests` failure message: which requests
 * arrived without a handler (method and path, the minimum needed to locate
 * them in the code) followed by the full traffic dump, in case the missing
 * handler becomes obvious when seen alongside the rest.
 */
export function noUnhandledRequestsFailureMessage(messageContext: {
  utils: MatcherState['utils']
  unhandledEntries: ResolvedRequest[]
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, unhandledEntries, traffic, isNot } = messageContext

  // Under `.not`, what failed is that `unhandledEntries` is EMPTY — listing
  // "Unhandled requests:" followed by nothing is the bug this `isNot`
  // fixes: the negated assertion demanded traffic without a handler and
  // there was none.
  const leadLine = isNot
    ? 'Expected to find some request without a handler, but the traffic came in clean'
    : `Unhandled requests:\n${unhandledEntries
        .map((entry) => `  ${entry.method} ${entry.path}`)
        .join('\n')}`

  const sections = [
    utils.matcherHint('toHaveNoUnhandledRequests', undefined, undefined, {
      isNot,
    }),
    leadLine,
    `Observed traffic:\n${formatTraffic(traffic)}`,
  ]

  return sections.join('\n\n')
}

function describeExpectedResponse(
  expected: ExpectedResponse,
): Record<string, unknown> {
  return expected.body === undefined
    ? { status: expected.status }
    : { status: expected.status, body: expected.body }
}

/**
 * Composes the `toHaveRespondedWith` failure message: the matcher's hint,
 * the expected response, a diff against the closest intercepted-and-matched
 * candidate (even if it doesn't match on status or body) if one exists, and
 * the full dump of the observed traffic. The candidate requires `matched &&
 * mocked` because a passthrough entry can match the request's spec without
 * ever having been intercepted: showing it as "close" would be misleading.
 */
export function respondedWithFailureMessage(messageContext: {
  utils: MatcherState['utils']
  spec: RequestSpec
  expected: ExpectedResponse
  traffic: ResolvedRequest[]
  isNot: boolean
}): string {
  const { utils, spec, expected, traffic, isNot } = messageContext

  const leadLine = isNot
    ? `Not expected: ${utils.printExpected(describeSpec(spec))} responded with ${utils.printExpected(describeExpectedResponse(expected))}`
    : `Expected: ${utils.printExpected(describeSpec(spec))} responded with ${utils.printExpected(describeExpectedResponse(expected))}`

  const sections = [
    utils.matcherHint('toHaveRespondedWith', undefined, undefined, { isNot }),
    leadLine,
  ]

  const candidate = traffic.find(
    (entry) => entry.matched && entry.mocked && matchesSpec(entry, spec),
  )
  if (candidate) {
    // Same key (`body`) on both sides, and absent on both if `expected`
    // doesn't carry it: with different names (`body` vs `responseBody`) the
    // diff finds no common ground and shows two whole unrelated blocks
    // instead of pointing at the field that actually changed inside the
    // body.
    const diff = utils.diff(
      describeExpectedResponse(expected),
      expected.body === undefined
        ? { status: candidate.status }
        : { status: candidate.status, body: candidate.responseBody },
    )
    if (diff) sections.push(diff)
  }

  sections.push(`Observed traffic:\n${formatTraffic(traffic)}`)

  return sections.join('\n\n')
}
