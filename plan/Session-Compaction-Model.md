# Guard Phase 0: session-compaction boundary model

## Result

Added a pure, non-executable compaction model. A compaction proposal binds the
session, workspace and policy epoch, retains only existing bounded messages, and
stores a bounded summary as untrusted data. Policy changes reject older proposals.
No summary can authorize launch, credentials, host paths or Docker operations.

No pi runtime, session file, filesystem, Docker, network or credential operation
is performed. This model does not prove SDK compaction behavior, transcript
redaction, persistence durability or hostile-guest resistance. Guard remains
**Locked / not active / canLaunch false / executable false / gateway deferred**.

## Bounds and decisions

- At most **128 messages**, each at most 4 KiB.
- Summary at most **16 KiB**, nonempty, and rejected for credential/launch/host-data
  markers in this fixed synthetic model.
- Session/workspace identifiers use opaque fixed grammars; policy epochs are
  nonnegative safe integers.
- Accepted proposals preserve session/workspace/policy identity and copy retained
  messages. Workspace and policy changes fence stale proposals.
- `executable` is always literal `false`; a summary is never an execution plan.

Ten tests cover identity/epoch binding, mutation isolation, malformed and oversized
inputs, unretained messages, policy drift, workspace/host-data markers and bounds.

## Remaining limits

This remains design evidence only. Real SDK compaction, runtime transport,
third-party extension behavior, durable policy epochs, filesystem admission and
backend operation receipts remain pending. Do not connect this model to Docker or
use it to authorize a native agent run.
