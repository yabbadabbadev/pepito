# Changelog

## [0.2.0](https://github.com/yabbadabbadev/pepito/compare/v0.1.1...v0.2.0) (2026-09-02)


### Features

* framework-agnostic core + subpath adapters for /react, /vue, /svelte ([#9](https://github.com/yabbadabbadev/pepito/issues/9)) ([2a1ab74](https://github.com/yabbadabbadev/pepito/commit/2a1ab74274d8c8ac03980f368cde8260c7330f3a))

## [0.1.1](https://github.com/yabbadabbadev/pepito/compare/v0.1.0...v0.1.1) (2026-08-20)

Nothing changed for consumers of this package: no new API, no fix, no
behaviour change. `0.1.1` exists to exercise the publishing path end to end,
and it is the first release published from a public repository, so it is the
first to carry a provenance attestation.

If you are on `0.1.0`, there is no reason to upgrade beyond wanting the
attestation.

## 0.1.0 — 2026-08-14

First release: `setupNetwork`, `mount`, request descriptors (`get`, `post`,
`put`, `patch`, `del`, `query`, `request`) and the matchers
`toHaveBeenRequested`, `toHaveBeenRequestedTimes`, `toHaveBeenIntercepted`,
`toHaveRespondedWith` and `toHaveNoUnhandledRequests`, plus `network.log()`
and `network.idle()`.
