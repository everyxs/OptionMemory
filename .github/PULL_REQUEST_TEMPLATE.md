## Issue and specification

Refs #<issue-number>

Spec version: <version implemented>
Test iteration: <iteration and Change Log link>

## Summary

<what changed and why>

## Scope and ownership

<owned files/contracts, dependencies, and explicit exclusions>

## Author verification

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `CARGO_TARGET_DIR="$PWD/target" cargo build --manifest-path server/Cargo.toml --locked`
- [ ] Required focused, isolated Mem/RocksDB, acceptance, recovery, and real-host scenarios for this increment

Commands and results:

```text
<exact commands, results, and test counts>
```

## Evidence

<actual row/event/evidence IDs, isolated environment, and real-host links where required. Generated prose alone is not evidence.>

## Specification iterations

<failure classifications and changed expectations, or state that no expectation changed>

## Limitations and non-goals

<what remains unimplemented or unverified>

## Reviewer focus

<contracts, risks, or scenarios requiring particular attention>

## Merge requirements

- [ ] Every required check is green and every failure is classified.
- [ ] The experienced reviewer independently reproduces required checks when team review is active.
- [ ] Post-merge `main` verification is recorded before the issue is closed.
