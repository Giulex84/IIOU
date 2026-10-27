# IIOU Testnet — candidate for review

Status: Testnet publication authorized; isolated real Redis validation passed.
Authenticated Pi Browser acceptance is pending.

The preparation notes below describe the initial local checks. Their real-Redis
release gate was subsequently satisfied by the isolated Vercel validation;
manual device checks remain open.
Source: Giulex84/IIOU at 3fa699f21ab8906b9510cf4c1330be91199cc2f5.

## Change

All normal IOU saves compare the exact last-read record and save its indexes
in the same Lua operation. New records cannot replace existing identifiers.
Pending username claims use that same path. A recurring settlement saves its
source record, next cycle, pointer and indexes together; the next cycle is not
written separately beforehand. Authorized creditor retries return the already
saved cycle identifier after a lost reply. Every involved Redis key type is
checked before writing because Redis Lua runtime errors do not roll back writes.

## Validation and remaining gates

- `npm test`: stale updates, duplicate and simultaneous settlements, monthly
  date rollover, lost responses, index corruption, pending claims and permissions.
- Production Lua source is executed by a local Lua interpreter against a small
  Redis command model; this is not a live Redis/Upstash test.
- Before publishing: repeat against isolated Redis and verify lifecycle, partial
  settlements, notes, reminder cooldown, recurring settlement and group creation
  with two Testnet accounts in Pi Browser. Check conflict/reload behavior.
- Recheck upstream before applying. No historical duplicate is deleted or repaired.
- Existing multi-record group creation is not made transactional by this patch.
- Existing frontend request identifiers are unchanged; a lost reply for a new
  standalone agreement or group is not made idempotent by this patch.

## Release and rollback

No Mainnet, payment code, network or cloud configuration change is included.
Do not push the connected main branch or trigger a deployment without approval.
Data keys and record format are compatible with the previous code. Rolling back
preserves records but restores unsafe concurrent writes and split recurrence
commits. Do not use rollback as a data-cleanup operation.

## Activity and approval log

- 26 October 2026: initial inventory and audit readings authorized by Giuliano;
  subsequent readings authorized autonomously. No external changes authorized.
- 27 October 2026: “Procedi con ciò che è fattibile” used for isolated candidate
  development and local checks. No GitHub push, deployment, credential changes,
  cloud reconfiguration, messages, payments or live data writes were performed.
- Decision: prepare the Testnet correction only, preserve existing product rules
  and network separation, and retain explicit real-Redis/Pi-Browser release gates.
- Verification: local regression suite passed; syntax checks passed. Actual Redis,
  Upstash fault testing and authenticated Pi Browser checks remain outstanding.
- Deployment and Mainnet promotion: not approved or performed by this work.

## Testnet deployment authorization — 27 October 2026

Giuliano explicitly approved publishing both Testnet candidates and will perform
the authenticated Pi Browser checks with his own account. Mainnet is excluded.
Before assigning the regular Testnet domain, an isolated Vercel deployment runs
`scripts/test-redis-isolated.cjs` against random audit:testnet:* keys only.
The validation does not call Pi APIs, read user records, change credentials or
reset any database. It deletes only its own temporary test keys.
The previous deployment and source commit remain the code rollback reference.
Final deployment status and manual acceptance are recorded separately.

## Real Redis validation evidence

- Validation deployment: dpl_5aK9B8cSEXbKhGaf8ZhyXfr8JPBn.
- Reviewed implementation commit: f17cb2b9092eaa28a8ca7af02b4c2b3a49219f98.
- Build output confirmed: PASS isolated real Redis persistence checks and cleanup.
- Keys were confined to a random audit:testnet namespace; no user records or Pi payments were used.
- Previous domain deployment for code rollback: dpl_CZLRThrsExmtTjG81tje1axNEAT2.
- Changes to Mainnet, credentials, database configuration or product prices: none.
- User trial: single owner account; two-person authorization checks remain a separate manual gate.
