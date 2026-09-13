# Guard Phase 0: workspace and policy-drift fencing model

## Result

Added a pure, non-executable model for lifecycle scope changes. A request binds
an opaque workspace identifier, policy epoch, token epoch and admitted relative
path. Policy revision, workspace replacement, token rotation or explicit fencing
rejects stale work; workspace replacement clears admission rather than adopting
paths from the old workspace.

No filesystem, project, credential, guest, Docker, network or identity operation
is performed. The model does not authorize a launch, apply a patch or prove that
a real runtime/backend enforces these decisions. Guard remains **Locked / not active
/ canLaunch false / executable false / gateway deferred**.

## Files and decisions

- `guard-host/policy-scope-model.ts`: bounded authority/request model.
- `tests/guard-policy-scope-model.test.ts`: 10 tests.

The fixed workspace grammar is an opaque `workspace-` token, with at most 16
admitted relative paths. Empty components, traversal, absolute paths and
unadmitted paths fail closed. Every accepted request matches the current workspace,
policy epoch, token epoch and path set exactly. Returned arrays are detached.

A policy change increments the policy epoch even if a path remains admitted. A
workspace change increments the token epoch and clears all paths. Token rotation
rejects already-issued requests without changing workspace policy. Explicit fencing
clears paths and rejects both new and old requests. These model future-request
fences; they do not undo already accepted or delayed effects.

## Limits and next work

This does not validate cross-workspace filesystem isolation, NTFS aliases/reparse
races, persisted epoch durability, authenticated IPC, third-party extensions,
compaction, or backend operation receipts. It must not be connected to the existing
Docker fixture until durable authority/checkpoints and operation receipts are
validated. Gateway/provider acceptance remains deferred.
