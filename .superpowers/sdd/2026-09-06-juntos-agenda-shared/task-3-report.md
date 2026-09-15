# Task 3 report — versioned agenda store and activity records

## RED

- Added `postgres-agenda-store.test.ts` before creating the store modules. The tests cover server-owned identity and timestamps, revision reads, partner updates, optimistic conflict payloads, scoped foreign reads and mutations, non-member assignees, tombstones, departed assignee reads, redacted activity, and rejected-write revision invariants.
- Ran `npm --workspace @juntos/api test -- postgres-agenda-store` before the implementation. It failed as intended because `./postgres-agenda-store.js` did not exist.

## GREEN

- Added the `AgendaStore` contract, `AgendaVersionConflict`, and a specific 400 input error for assignees that are not active members of the trusted space.
- Added `PostgresAgendaStore`. Every operation uses `withMemberTransaction`, so membership is resolved from `userId`, the space and state row are locked before agenda access, and no caller may select a space or author.
- Creates use server ids, actor and timestamps. Updates/deletes lock only the exact `(space_id, id)` row, preserve first writer metadata, apply the version predicate, return 404 for foreign/missing ids, and expose the latest same-space row only through an optimistic conflict.
- Deletes remain tombstones; reads exclude them. Writes advance the per-space revision and create one activity record without event title or notes. Reads expose only active members' public fields; assignments to departed users remain on events so the later UI can render its `Ex-integrante` fallback.

## Verification

- `npm --workspace @juntos/api test -- postgres-agenda-store` — 1 file, 6 tests passed.
- `npm --workspace @juntos/api test` — 16 files, 81 tests passed.
- `npm --workspace @juntos/api run typecheck` — passed.
- `npm test` — deployment 5, API 81, web 108, contracts 19 tests passed.
- `git diff --check` — passed.

## Self-review

- SQL is parameterized; foreign ids use the trusted transaction space and are indistinguishable from absent event ids.
- State changes and activity insertion share the member transaction, so failures roll back both; failed validation/conflict paths do neither.
- Timestamp, civil-date, and bigint conversions are explicit and no read query selects user email.
- The later protected-route task must map `AgendaInputError` to its existing generic 400 response, while unknown database exceptions remain 500.

## Fix round 1/5 — preserve PostgreSQL civil dates

### RED

- Added a store regression that simulates the node-postgres OID 1082 value for local midnight in UTC+03. Its UTC ISO day is one day earlier than its local civil components, and it covers both `date` and `recurrence_until`.
- Ran `npm --workspace @juntos/api test -- postgres-agenda-store`; the new test failed with `2026-09-06`/`2026-09-13` instead of `2026-09-07`/`2026-09-14`.

### GREEN

- Civil row mapping now validates strings through `parseCivilDate`; when node-postgres supplies a `Date`, it builds the civil value from `getFullYear()`, `getMonth()`, and `getDate()` rather than UTC ISO serialization.
- This keeps the real PostgreSQL OID 1082 local-midnight semantics intact while retaining pg-mem compatibility, which does not support `date::text` projections.

### Verification

- `npm --workspace @juntos/api test -- postgres-agenda-store` — 1 file, 7 tests passed.
- `npm --workspace @juntos/api test` — 16 files, 82 tests passed.
- `npm --workspace @juntos/api run typecheck` — passed.
- `npm test` — deployment 5, API 82, web 108, contracts 19 tests passed.
- `git diff --check` — passed.
