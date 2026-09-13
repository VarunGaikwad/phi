# Guard Phase 0: runtime transport framing model

## Result

Added a pure bounded transport model. Frames carry a fixed version, nonce, epoch,
sequence, kind and bounded body. Duplicate, out-of-order, stale and wrong-nonce
frames fail closed. Cancellation rejects later frames while preserving prior
accepted evidence; epoch advance resets sequence only after a quiescent state.

No pipe/socket/listener is opened and no peer is authenticated. The model does not
provide execution, recovery or authorization authority. Guard remains **Locked /
not active / canLaunch false / executable false / gateway deferred**.

## Bounds and limits

Frame bodies are limited to **8 KiB**, sequence history to **64**, and all counters
must be safe nonnegative integers. Exact object keys are required and returned
arrays are detached. This is protocol-shape evidence only: it does not prove
transport confidentiality, local-only behavior, endpoint ownership, peer identity,
process lifetime, replay protection against a coordinated authority, or backend
receipt semantics.

Ten tests cover framing, nonce/epoch/sequence binding, cancellation, epoch reset,
malformed/oversized frames, gaps/duplicates, mutation isolation and explicit
absence of authority fields. Do not connect this model to the blocked native pipe
or Docker recovery adapter.
