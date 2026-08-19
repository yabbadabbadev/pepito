# Security Policy

## Supported versions

`@yabbadabbadev/pepito` is at `0.1.0` — its first and only release. There is
no older major or minor line to maintain, so the only version that receives
security attention is the latest one published to npm. Once a `1.x` line
exists this section will be revisited; until then, there is nothing to list
a support matrix for.

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub's private
vulnerability reporting for this repository (the "Report a vulnerability"
button under the Security tab) rather than a public issue, so a report
doesn't disclose the flaw before a fix exists.

## What to expect

This is a small project with a single maintainer. Reports are handled on a
best-effort basis: there is no committed response time, no committed fix
window, and no bounty. You will get a reply when the maintainer is able to
look at it.

## Scope

This package is a **test-time** dependency: it runs inside a developer's
test suite and in CI, on top of MSW and Vitest browser mode. It is not a
runtime dependency of any deployed service, so the usual runtime-exploitation
concerns (a live server processing attacker input) don't apply here — there
is no live server. The risk surface worth reporting is closer to
supply-chain: anything that could make what gets published to npm differ
from what's in this repository's source, or a dependency issue that would
compromise the package as consumed by other projects' test runs. See
[`docs/trusted-publishing.md`](docs/trusted-publishing.md) for how this
package is published.
