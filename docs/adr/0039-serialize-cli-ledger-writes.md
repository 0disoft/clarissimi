# ADR 0039: Serialize CLI Ledger Writes

- Status: Accepted
- Date: 2026-07-12
- Amended: 2026-09-29
- Owner: Repository maintainers

## Context

`import-draft` previously performed an unguarded read-modify-write of the canonical ledger and then
wrote derived outputs independently. Concurrent commands could all return success while retaining
only the last writer's contribution. A derived-file failure could also occur after the canonical
ledger had already changed, leaving public outputs on different generations.

## Decision

- `import-draft` acquires an exclusive sibling lock file before reading or changing the ledger.
- Lock acquisition is bounded and fails instead of silently proceeding after the timeout.
- The command renders a complete generation while holding the lock.
- Exports acquire source and destination canonical ledger locks in deterministic path order,
  recheck path resolution after acquisition, and preserve every existing destination record.
- Writing rebuilds require an existing source; a missing default is allowed only for a preview.
- Every destination is preflighted and every new file is written to a same-directory temporary
  file before replacement begins.
- Existing regular files retain their POSIX access permission bits after replacement, including
  public pages and restricted ledgers. Temporary files start at mode 0600; after a complete write,
  existing access bits are applied explicitly before any rename so umask cannot narrow them.
  New destinations retain the private 0600 default. Permission-setting failures abort preparation
  and preserve all existing outputs. File ownership, ACLs, and special mode bits are not copied.
- Derived outputs are replaced before the canonical ledger. The ledger rename is the generation's
  final commit point.
- Before any replacement, existing destinations are copied to exclusive same-directory recovery
  files. A replacement failure restores already replaced files in reverse order and removes newly
  created outputs. If restoration fails, remaining recovery copies are kept and their paths are
  reported; restoration of other files still runs. Recovery copies stay on disk so a large ledger
  does not need an additional in-memory copy.
- Temporary files and the lock are removed on normal failure paths.

The lock coordinates Clarissimi CLI writers. It is not a distributed lock and cannot prevent an
unrelated program that ignores the lock from modifying the same files.

## Consequences

- Concurrent local imports are serialized and cannot report success for lost records.
- Invalid derived destinations fail before the canonical ledger changes.
- A process crash during replacement can still leave some derived files ahead of the ledger, but
  the canonical ledger remains the recovery source and `rebuild` restores derived outputs.
  Crashes can also leave `.clarissimi-backup` files; inspect them before removing them. Normal
  replacement failures attempt rollback, but neither multi-file crash atomicity nor disk-failure
  recovery is guaranteed. Backup preparation requires extra disk space and fails before replacing
  any output when that preparation cannot complete.
- A process terminated without cleanup can leave a stale lock that requires explicit maintainer
  inspection and removal; Clarissimi does not guess that a lock owner is dead.
- A newly acquired lock records a PID, acquisition time, and random owner token. Normal cleanup
  checks the token-bearing file before removal and leaves a replacement lock in place when ownership
  has changed. These fields aid manual inspection; they are not proof that a process is still alive.

## Validation

- concurrent import regression with distinct source identities
- derived-destination failure regression proving the canonical ledger remains unchanged
- repository `format`, `lint`, `test`, `smoke`, `check`, and `contract` gates
