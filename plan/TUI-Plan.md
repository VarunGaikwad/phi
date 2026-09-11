# PHI Terminal UI Plan

> Status: implementation plan, not an implemented feature set. Execution is queued behind the feasibility/permission prerequisites in [Execution Order](Execution-Order.md); no layout fallback has been selected.
>
> Companions: [Modes Plan](Modes-Plan.md) for workflow behavior and [Guard Plan](Guard-Plan.md) for the requested personal-file protection boundary.
>
> Package: `@preapexis/phi` · Working directory: `C:/Projects/phi`
>
> Inspected development baseline: pi coding agent and pi-tui `0.85.1`, Node.js `>=22.19.0`.

## 1. Goal

Build a polished, keyboard-first terminal interface for pi as an installable **extension + theme package**, without forking pi or replacing its agent loop.

PHI should make three things immediately readable:

1. **What the agent is doing:** conversation, tool activity, results, and errors.
2. **What is driving it:** `Code · MiMo V2.5 Free`, with `OpenCode Zen` aligned on the right of the prompt footer.
3. **What the session is using:** context, tokens, reasoning, cache, response speed, costs, and per-model usage.

Preserve pi's editing, streaming, tool execution, session navigation, cancellation, and message queue behavior. The UI must not change model inputs or tool results just to improve their appearance.

## 2. Requirements and scope

### Confirmed requirements

- A good-looking terminal UI distributed as a pi extension package.
- A detailed session inspector with collapsible **Context**, **Token Usage**, and **Models** sections.
- Session name and creation timestamp, including an unnamed-session presentation such as `New session - 2026-09-08T12:10:50.928Z`.
- Context token count, context percentage, and estimated spend.
- Input, output, reasoning, cache read/write, cache rate, generation speed, and estimated cost.
- Models grouped by provider, with **Model / Steps / Cost** columns and expandable model rows.
- An explicit **mode label next to the model**, with the provider visually separated.
- Five approved workflow modes: **Ask, Plan, Code, Debug, Review**, with **Code** as the new-session default. Their behavior and permissions are specified in [Modes Plan](Modes-Plan.md).
- Protection against access to personal/important files in every mode. The user approved VM/container isolation with **Windows host support** and **an isolated working copy with reviewed host application**, as specified in [Guard Plan](Guard-Plan.md). A TUI badge or permission prompt alone does not provide this protection.

### Proposed defaults

These are design recommendations, not additional user-confirmed requirements:

- Brand: **PHI**; default theme: **Midnight**.
- Charcoal surfaces, cyan accents, violet secondary highlights, subtle borders.
- Readable tool cards and a compact activity indicator.
- An always-visible right inspector on sufficiently wide screens **if the layout feasibility gate passes**.
- An on-demand inspector on narrower screens.
- Standard Unicode by default, ASCII fallback, optional Nerd Font glyphs.
- Low-motion animation only while working; no idle decorative animation.

### Out of scope for the first release

- New providers, authentication flows, MCP clients, LSP servers, subagents, or background shells.
- Autonomous Git actions or deployment; explicit mode permission gates are covered by the companion modes plan.
- A full file explorer, terminal IDE, or standalone SDK/RPC frontend.
- Additional or executable custom modes beyond the approved five-mode workflow system.
- Reimplementing the entire native transcript renderer.
- Billing-account balances or claims about the user's actual provider invoice.

## 3. Visual design

### 3.1 Requested wide-screen concept

This is a design target, not proof that pi exposes the required docking hooks. Values below are illustrative, based on the user's sample; they must never be hardcoded into the implementation.

```text
+------------------------------------------------------------------------------------------------------------+
|  P H I   / projects / phi                                                        main * | 3 files changed  |
+----------------------------------------------------------------+-------------------------------------------+
|                                                                | SESSION                                   |
| YOU                                                            | New session                               |
| Add validation to the authentication endpoint.                 | 2026-09-08T12:10:50.928Z                  |
|                                                                |                                           |
| PHI                                                            | v Context                                 |
| I'll check the schema, update the handler, and run the tests.  |   12,275 tokens                   6% used |
|                                                                |   [#...................]                  |
| +-- READ --------------------------------------------------+   |   Estimated spend                   $0.00 |
| | src/auth.ts                                              |   |                                           |
| | [OK] Complete                                  142 lines |   | v Token Usage                             |
| +----------------------------------------------------------+   |   Input                            10,194 |
|                                                                |   Output                               33 |
| +-- EDIT --------------------------------------------------+   |   Reasoning                             0 |
| | src/auth.ts                                              |   |   Cache read                        2,048 |
| | - const email = body.email;                              |   |   Cache write                           0 |
| | + const email = emailSchema.parse(body.email);           |   |   Cache rate                        16.7% |
| | [OK] Applied                                    +18 / -6 |   |   Generation speed              ~58.1 t/s |
| +----------------------------------------------------------+   |   Estimated cost                    $0.00 |
|                                                                |                                           |
| +-- SHELL -------------------------------------------------+   | v Models (1)                              |
| | $ npm test                                               |   |   OpenCode Zen                            |
| | [..] Running                                        4.2s |   |                                           |
| +----------------------------------------------------------+   |   Model                   Steps      Cost |
|                                                                |   > MiMo V2.5 Free            1     $0.00 |
| [..] Running tests...                              Esc to stop |                                           |
|                                                                |                                           |
| +-- YOUR PROMPT -------------------------------------------+   |                                           |
| | > Also cover invalid email addresses...                  |   |                                           |
| |                                                          |   |                                           |
| +-- Code · MiMo V2.5 Free ----------------- OpenCode Zen --+   |                                           |
|                                                                |                                           |
+----------------------------------------------------------------+-------------------------------------------+
|  Enter send   /phi control center   /phi stats inspector                                   PHI / MIDNIGHT  |
+------------------------------------------------------------------------------------------------------------+
```

The implementation should improve padding and spacing at the actual terminal width rather than copying fixed-width strings from this mockup.

### 3.2 Prompt footer: required composition

```text
+-- YOUR PROMPT -----------------------------------------------+
| > Also cover invalid email addresses...                      |
|                                                              |
+-- Code · MiMo V2.5 Free --------------------- OpenCode Zen --+
```

- **Left:** mode, middle-dot separator, human-readable model name.
- **Right:** human-readable provider name.
- Use effective model/provider metadata, falling back to IDs when names are unavailable.
- Do not hardcode MiMo, OpenCode Zen, or a specific reasoning level.
- Mode is not the reasoning level. `Code` and `high` describe different things.
- Update after model selection, session restoration, and supported workflow-mode changes.
- On narrow terminals, move the provider to a second metadata row, then truncate secondary information before hiding the mode.
- The ASCII fallback uses `Code | MiMo V2.5 Free`.

### 3.3 Palette and appearance

| Role | Proposed color | Use |
|---|---|---|
| Base | `#10141C` | Suggested matching terminal background |
| Surface | `#171E2A` | Editor and tool surfaces where supported |
| Border | `#354255` | Thin, quiet frames |
| Main text | `#E6EDF5` | Conversation and primary values |
| Secondary text | `#9AAAC0` | Providers, timestamps, metadata |
| Accent | `#70D7E8` | PHI identity, mode, focused headings |
| Secondary accent | `#B6A0F8` | Selected controls and model highlights |
| Success | `#91D7A3` | Successful tools and added lines |
| Warning | `#E8BC75` | Active work and high context usage |
| Error | `#F18B98` | Failures and removed lines |

Implementation rules:

- Map colors through pi theme tokens; validate all required tokens against the installed schema.
- A theme does not necessarily own the terminal's whole background. Offer a matching terminal profile as documentation, not an automatic terminal configuration change.
- Use text labels as well as color; failures must remain obvious in monochrome.
- Use `~` for estimates and `—` for unavailable values. ASCII fallback uses `n/a`.
- Apply color at render time or rebuild cached content on `invalidate()` so theme changes work immediately.
- Keep the welcome/header small. A large logo must not consume working space.

### 3.4 Responsive behavior

Proposed breakpoints, to be adjusted after terminal testing:

| Available size | Presentation |
|---|---|
| At least 110 columns and 34 rows | Docked inspector if approved and supported; approximately 36–44 columns wide |
| 80–109 columns | Full-width chat and prompt; inspector opened on demand |
| Under 80 columns | Compact prompt metadata; full-width inspector view with scrolling |
| Under 24 rows | Reduce decoration and default expansion; prioritize input and error visibility |

The top workspace bar in the concept is not automatically a sticky bar: `setHeader()` replaces the startup header above chat. A persistent top bar is part of the same layout feasibility gate as the docked inspector.

Regular mode must preserve native terminal scrollback. Fullscreen support is optional and must be tested separately; do not silently enable pi's experimental fullscreen mode.

## 4. Architecture feasibility gate

Complete this before committing to a permanent sidebar. Separately, the [Guard Plan](Guard-Plan.md) requires a validated containment backend before advertising personal-file protection; sidebar feasibility and security feasibility are independent.

| Feature | Supported approach | Constraint |
|---|---|---|
| Theme | Package JSON theme | No general terminal-background ownership |
| Welcome/header | `ctx.ui.setHeader()` | Startup/chat header, not a guaranteed sticky dock |
| Prompt and mode/model row | `CustomEditor` and `ctx.ui.setEditorComponent()` | Preserve editing and app keybindings |
| Summary footer | `ctx.ui.setFooter()` | Preserve other extensions' status information |
| Activity widget | `ctx.ui.setWidget()` / working-indicator APIs | Keep height small and avoid duplicate spinners |
| Inspector | `ctx.ui.custom()` | Overlay or temporary replacement UI; manage focus and disposal |
| Tool cards | Built-in tool delegation with custom renderers | Optional, conflict-sensitive execution overrides |
| Permanent right rail | No documented coding-agent sidebar reservation hook verified | Must prove safe transcript width and focus ownership first |

Although pi-tui exposes `HStack` and layout primitives, that alone does not provide a stable extension-owned slot beside the coding agent's transcript. Mutable TUI children are not a documented contract for identifying or replacing the native chat layout.

### Gate deliverables

- A minimal prototype and a written decision on whether docking is supportable through public APIs.
- Demonstrate that chat wraps to the remaining width, rather than being covered by the inspector.
- Verify input focus, cursor/IME positioning, scrollback, selection, links, images, overlays, resizing, `/reload`, and session switching.
- Confirm the startup header versus fixed-header behavior in both regular and fullscreen modes.

### If docking cannot be supported cleanly

Propose this fallback for user approval:

1. Native scrolling chat with the PHI theme and prompt footer.
2. A compact always-visible context/cost summary near the editor.
3. `/phi stats` opens the complete collapsible inspector as an overlay or temporary panel.

An overlay intentionally covers content while open; it must not be marketed as a non-overlapping docked sidebar. Do not silently substitute the fallback for the requested design, monkey-patch private rendering methods, or convert the package into a standalone frontend without approval.

## 5. Session inspector specification

### 5.1 Session identity

- Read the display name from the session manager; use `New session` as the unnamed fallback.
- Read creation time from the session header, not extension load time or the current clock.
- Show `Name - ISO timestamp` when space permits; otherwise split it into two lines.
- Preserve the UTC timestamp and milliseconds in the detail view.
- React to `/name`, `/new`, `/resume`, `/fork`, `/clone`, and `/reload`.
- Handle ephemeral sessions and missing historical metadata without fabricated values.

### 5.2 Context

Display:

- Current context tokens.
- Percentage of the active model's context window.
- A small proportional usage bar.
- Estimated session spend, repeated from the same cost aggregate used in Token Usage.

Use `ctx.getContextUsage()`. This is current, compaction-aware context usage, not cumulative session token usage. Respect `null`/unknown values after compaction; never turn them into `0%`.

Proposed context colors: normal below 70%, warning at 70%, error at 90%. Clamp only the graphical bar to its available width; do not hide a real over-capacity numeric value.

### 5.3 Token Usage: definitions

Default scope: **all recorded usage in the current session file**, consistent with pi's session totals, including history on other branches and before compaction. Label the scope in the inspector's help/details.

| Field | Source and meaning |
|---|---|
| Input | Sum of recorded `usage.input`; pi tracks cached input separately |
| Output | Sum of recorded `usage.output`, including reasoning where the provider includes it |
| Reasoning | Reported `usage.reasoning`; a subset of output, never an extra term in total tokens |
| Cache read | Sum of `usage.cacheRead` |
| Cache write | Sum of `usage.cacheWrite` |
| Cache rate | Cached-read tokens divided by total input-side tokens for the displayed scope |
| Generation speed | Estimated output rate of the latest measured assistant response |
| Estimated cost | Sum of recorded `usage.cost.total` |

Definitions:

```text
input_side_tokens = input + cache_read + cache_write
cache_rate        = cache_read / input_side_tokens * 100
total_tokens      = input + output + cache_read + cache_write
response_rate     = latest_response.output_tokens / measured_response_seconds
```

Accuracy rules:

- A zero cache-rate denominator is unavailable, not `NaN`, infinity, or a made-up percentage.
- `reasoning: 0` means reported zero. Missing reasoning means unavailable. For mixed coverage, show a known subtotal with an explicit partial marker, not an apparently complete total.
- Do not add reasoning to output a second time or estimate reasoning tokens from displayed thinking text.
- Include recorded assistant usage, nested tool-result usage, compaction usage, and branch-summary usage exactly once.
- Use session entry IDs to deduplicate canonical records. Reconciliation must not count both a streaming snapshot and its finalized entry.
- Do not count retained/copied context payloads inside an entry again as new usage.
- `/tree` can change current context without reducing session-wide recorded spend.
- Forked/cloned sessions may contain inherited usage. Clearly describe these as recorded-history totals, not charges incurred since the fork or since opening PHI.
- Keep UI preferences and timing entries out of the accounting aggregate.

### 5.4 Generation speed

- Measure assistant `message_start` to `message_end` using a monotonic clock.
- Divide the final reported output-token count by that interval.
- Present the result as an estimate, for example `~58.1 t/s`.
- Explain in details that this is response output rate: it includes wait/transport time within the measured interval, excludes intervening tool execution, and is not raw model-decoder throughput.
- Output includes reasoning when reported in pi's output total; do not call it visible-text-only throughput.
- Never count streaming chunks, characters, or words as tokens.
- Keep active streaming values provisional. Do not invent a live token rate when the provider only reports final usage.
- Store measured timings as versioned extension-owned session metadata if historical rates should survive reload/resume. Old responses without measurements show unavailable.
- Do not calculate normal completion speed for aborted/error responses; retain any recorded token/cost usage from those responses.

### 5.5 Cost presentation

- Use recorded usage costs rather than repricing historical turns with today's model selection.
- Label amounts as estimated cost/spend based on pi/provider pricing metadata.
- `$0.00` is not proof that an account is free or that no subscription charge exists.
- Show unavailable when accounting data is absent. Preserve a distinction between no data, configured zero pricing, and a measured small positive cost.
- A positive value below one cent should display `<$0.01` or increased precision rather than misleading `$0.00`.
- Do not fetch billing data or credentials for this UI.

### 5.6 Models

- Group by recorded provider identity, then recorded model identity.
- Display friendly names when available; keep IDs available in the expanded detail view.
- `Models (N)` counts distinct recorded provider/model pairs, not all configured models.
- Merely selecting a model does not create a usage row before it has a recorded response.
- Each row shows **Model**, **Steps**, and **Estimated Cost**.
- Define a step as a finalized, non-error, non-aborted assistant response, including responses that request tools. A tool call is not a separate model step.
- Record failures/aborts separately in expanded details. Their reported costs still count.
- Treat pending/deferred work as pending, not a completed step.
- Expanding a model shows its token/cache/reasoning breakdown, measured response rate where available, and response history with completion state.
- Nested tool and summary usage may not identify the model. Put unattributable amounts in a clearly labeled **Other / unattributed usage** row rather than assigning them to the currently selected model.
- Attributed model costs plus unattributed costs must reconcile with the session total. The unattributed row is not included in `Models (N)`.

## 6. Workflow modes

The user approved **Ask, Plan, Code, Debug, and Review**, with Code as the default for new sessions. [Modes Plan](Modes-Plan.md) is the source of truth for behavior, tool policies, approvals, persistence, and implementation tests. All modes remain subordinate to [Guard Plan](Guard-Plan.md): a mode change or plan approval cannot override protected-file denial.

| Mode | Purpose | Default project effects |
|---|---|---|
| Ask | Explain and trace code with supporting references | Read only |
| Plan | Clarify requirements and save an executable plan | PHI-managed plan documents only |
| Code | Implement focused changes and validate them | Ordinary edits and recognized local checks |
| Debug | Reproduce, diagnose, minimally fix, and verify | Ordinary edits and recognized local checks |
| Review | Report prioritized, evidence-backed findings | Read only |

The composer displays the effective selection:

```text
<Mode> · <model display name>                       <provider display name>
```

Integration rules:

- Add a `/phi mode` picker and explicit selection commands through the existing `/phi` dispatcher.
- Mode suggestions require user confirmation; never silently gain write permissions or submit the editor draft.
- Plan saves under `plan/` and waits for explicit approval of the current revision before a Code execution handoff.
- Code/Debug preserve existing restrictions and require authorization for higher-impact actions. Ask/Review script execution requires a separately approved exception.
- Display pending transitions and execution exceptions separately; update the primary mode label only when the effective policy has changed.
- Keep mode state branch-aware and restore it safely on session changes. Historical approval records must not become reusable execution grants.
- Preserve the selected model/provider and reasoning level when changing modes by default.
- A mode is not an OS security boundary. Do not offer functional switches by merely changing a label or prompt.
- The mode controller and its basic picker/status do not depend on a docked sidebar or fullscreen rendering.

The original Code-label-only assumption is superseded by the approved companion plan. Both plans remain documentation until implemented and tested.

## 7. Interaction and component behavior

### Commands

Register one namespaced command with argument completion; do not replace built-in commands.

| Proposed command | Behavior |
|---|---|
| `/phi` | Open the control center |
| `/phi stats` | Open/focus the inspector; provide an explicit close action |
| `/phi mode` | Pick a workflow mode and review its capabilities |
| `/phi plan` | Show the current plan revision and execution progress |
| `/phi permissions` | Explain the current policy and execution exceptions |
| `/phi guard` | Show controller-reported protection state and approved scope; no guest disable/allow-all action |
| `/phi appearance` | Theme, density, icons, and animation preferences |
| `/phi focus` | Toggle optional UI decoration/summary visibility |
| `/phi reset` | Reset PHI-owned preferences, not pi's global settings |
| `/phi help` | Explain controls, metrics, layout limitations, and compatibility |

Continue using native `/model`, `/thinking`, `/name`, `/session`, `/tree`, and `/resume`. Do not assume built-in commands can be executed by sending them as arbitrary model prompts.

### Inspector controls

- Up/Down: move between section headings and model rows.
- Enter/Space: expand or collapse the selected row.
- Left/Right: collapse or expand where appropriate.
- Escape: close the overlay or return focus from the dock to the editor.
- Scroll expanded content without losing the ability to reach its heading.
- Mouse interaction is optional in fullscreen mode only; regular mode leaves mouse scrollback to the terminal.
- Tab must remain autocomplete in the prompt. Panel-specific navigation applies only while the panel owns focus.
- Use the injected keybinding manager and actual configured hints. Avoid default shortcuts that steal pi's model cycling, editor deletion, or other existing actions.
- Opening a statistics inspector must not falsely imply the agent has stopped or is awaiting an answer.

### Prompt and transcript

- Extend `CustomEditor`, not the bare base editor, and delegate unhandled input.
- Preserve multiline input, history, paste collapse, images, file references, path/slash completion, external editing, cancellation, and steering/follow-up queueing where allowed by Guard.
- Native conveniences must not bypass the admitted workspace: attachments, old sessions, exports, and external-editor integration follow the Guard plan's scoped runtime/import rules.
- Preserve cursor markers, IME positioning, and input focus when adding the metadata row.
- Avoid fragile assumptions about which rendered editor line is the last border when autocomplete is open; verify against the installed editor API.
- Style normal messages and Markdown through supported theme/display hooks. Do not inject UI labels into model context or rewrite saved assistant messages.
- Keep other extensions' footer statuses visible; document any single-owner header/editor/footer conflicts.

### Tool cards and activity

- Show tool name, target path/command, explicit state, and live duration when measured.
- Render tools independently by `toolCallId`; parallel tools must not overwrite one shared status.
- States: pending, running, succeeded, failed, cancelled, and blocked where distinguishable.
- Show edit deltas from structured diff details. Do not infer success solely from output text.
- Collapsed cards are short; expanded cards retain useful output, syntax, diffs, truncation notices, full-output paths, and supported images.
- Respect pi's tool expansion controls. Failures must remain visible even in compact/focus mode.
- Use the working-indicator API or a single activity widget, not multiple competing spinners.
- Use `agent_settled` for the final idle state; `agent_end` can precede automatic retry, compaction, or queued work.

Renderer overrides are optional and require special care: registering a built-in tool name replaces its implementation slot. Delegate through the original public tool factories, preserve arguments/result shapes/prompt metadata/cancellation, and resolve the active session cwd correctly. Verify shell configuration and activation/exclusion behavior; do not accidentally enable a disabled built-in by registering its wrapper. Do not overwrite another extension's remote/sandbox/tool implementation just to change its appearance. If safe delegation cannot be established, retain native rendering plus the PHI theme and disclose that limitation. Execution must still use the already guarded backend: a renderer must never instantiate an unrestricted local fallback to preserve appearance.

## 8. Technical structure

Proposed files; this plan does not create or restore them:

```text
package.json
extensions/
  phi.ts                       # Single package entry point
  phi/
    lifecycle.ts               # Bind/rebind events and dispose resources
    state.ts                   # Typed UI state and selectors
    config.ts                  # Validated, versioned PHI preferences
    metrics.ts                 # Pure usage aggregation and coverage rules
    timing.ts                  # Response/tool timing and optional persistence
    modes/                     # Controller, policies, workflows; see Modes Plan
    guard/                     # Scoped client/status integration; see Guard Plan
    commands.ts                # /phi control center and subcommands
    format.ts                  # Counts, currency, dates, widths, safe text
    layout.ts                  # Responsive policy and approved layout adapter
    components/
      header.ts
      editor.ts
      footer.ts
      inspector.ts
      control-center.ts
      activity.ts
    renderers/
      tools.ts                 # Optional built-in renderer delegation
      diff.ts
themes/
  phi.json                     # Midnight theme; preserve manifest path
tests/
  fixtures/
  metrics.test.ts
  state.test.ts
  ui.test.ts
  compatibility.test.ts
  smoke.py                     # Only if the existing smoke approach is retained
README.md
plan/
  TUI-Plan.md
  Modes-Plan.md
  Guard-Plan.md
```

Use pi's existing TUI components and width utilities. Do not add Ink, Blessed, React, or a second terminal renderer.

### State boundaries

- **Canonical session data:** read-only session manager and model metadata.
- **Derived metrics:** deterministic aggregates keyed by canonical entry IDs.
- **Provisional activity:** streaming messages, running tools, and timers; never counted twice as finalized usage.
- **UI preferences:** density, expansion, glyphs, animation, and approved inspector presentation.
- **Measured metadata:** optional versioned timing entries linked to finalized response entries.

Data flow:

```text
pi events + session manager + model metadata
                    |
                    v
       reconcile typed state / metrics
                    |
                    v
      width-aware, cached UI components
                    |
                    v
             tui.requestRender()
```

### Lifecycle

- Attach terminal UI only when `ctx.mode === "tui"`; `ctx.hasUI` alone also includes RPC.
- This guard applies to presentation, not workflow enforcement: the companion mode controller must enforce its policy in TUI, RPC, JSON, and print runtimes.
- Register handlers at load, but start timers/watchers only in session-scoped hooks or commands.
- On `session_start`, rebuild from the current session and bind fresh context references.
- Refresh identity/model data on their corresponding events; refresh active context after tree navigation and compaction.
- Reconcile provisional and persisted usage at verified post-persistence lifecycle points; test event ordering rather than assuming `message_end` always sees its entry already stored.
- On `session_shutdown`, dispose timers, input subscriptions, branch subscriptions, overlays, and pending async operations idempotently.
- Never keep using an old `ctx` or session-bound `pi` closure after session replacement.
- Recreate disposed overlays rather than reopening a stale component instance.

### Configuration and compatibility

- Suggested preferences: `density`, `animation`, `glyphs`, `inspectorPresentation`, and `toolCards`.
- Default to no required Nerd Font; offer Unicode and ASCII modes.
- Honor project-local configuration only when the project is trusted. Use pi's configuration helpers and `CONFIG_DIR_NAME` instead of assuming paths.
- Validate values and schema versions; recover gracefully from invalid settings.
- Do not change the user's saved model, terminal profile, project trust, or unrelated pi settings.
- Capture/wrap a prior editor factory where compatible. For other single-owner UI slots, document conflicts rather than claiming universal composability.
- Keep core pi imports as peer dependencies, not bundled copies. Follow pi's package guidance and document the tested version/minimum API baseline separately.
- The existing MCP dependency is not a requirement for this UI; review it during packaging, without adding MCP behavior to scope.

## 9. Performance and rendering rules

- Every rendered line must fit its supplied width, including ANSI-styled and wide Unicode content.
- Use `visibleWidth`, `truncateToWidth`, and ANSI-aware wrapping; do not use JavaScript string length as terminal-cell width.
- Never do synchronous filesystem reads, Git commands, or full-session parsing inside `render()`.
- Cache aggregates; update/reconcile outside rendering. Theme or terminal-size changes invalidate presentation caches.
- Coalesce streaming redraw requests. Start with a maximum of roughly 10–15 visual updates per second and measure before tuning.
- No decorative idle render loop. Dispose animation timers when work settles or the relevant component closes.
- Obtain branch information from pi's footer data provider; fetch optional dirty-file counts asynchronously with a timeout and modest debounce.
- Handle no Git repository, missing Git, detached HEAD, and long branch/path names.
- Treat externally sourced labels as untrusted terminal text: remove control sequences from session names, provider names, paths, and other PHI-owned labels without corrupting legitimate Unicode. Delegate rich tool output to safe renderers.
- Do not log session contents, credentials, raw prompts, or provider payloads for UI diagnostics.

## 10. Implementation phases

All phases below are pending. Do not implement future phases by restoring deleted files indiscriminately.

### Phase 0 — Feasibility and decisions

- [ ] Confirm the target terminal, font, and normal working window size.
- [ ] Audit the installed public APIs and document the tested baseline.
- [ ] Prototype sidebar width reservation and header behavior.
- [ ] Test regular/fullscreen rendering, focus, resize, and native dialogs.
- [ ] Obtain approval for the supported layout or the inspector-overlay fallback.
- [ ] Coordinate the approved five-mode controller and its policy feasibility gate with [Modes Plan](Modes-Plan.md); do not advertise a working mode before its enforcement is tested.
- [ ] Coordinate controller-reported Guard status and trusted host approvals with [Guard Plan](Guard-Plan.md); distinguish verified isolation, limited application checks, and locked/unavailable protection.

**Exit:** a chosen, reproducible layout that does not conceal chat or rely on fragile private internals.

### Phase 1 — Theme and prompt shell

- [ ] Create the Midnight theme and validate required tokens.
- [ ] Add a compact PHI header and summary footer.
- [ ] Build the required `Mode · Model` / right-aligned provider row.
- [ ] Preserve editor behavior, cursor positioning, and native shortcuts.
- [ ] Implement narrow-width metadata handling and ASCII fallback.

**Exit:** a useful PHI shell with accurate current model/provider labels and no editing regressions.

### Phase 2 — Session accounting

- [ ] Implement pure token/cost aggregation with fixtures.
- [ ] Implement context unknown/compaction handling.
- [ ] Handle optional reasoning coverage and input-side cache rate.
- [ ] Group model usage and reconcile unattributed costs.
- [ ] Define and implement response timing without chunk-count estimates.
- [ ] Verify resume, fork/clone, tree navigation, and reload semantics.

**Exit:** all requested metrics have tested sources, scopes, formulas, and unavailable states.

### Phase 3 — Inspector and controls

- [ ] Build collapsible Context, Token Usage, and Models sections.
- [ ] Add expandable per-model details and keyboard navigation.
- [ ] Mount through the Phase 0-approved layout adapter.
- [ ] Add the `/phi` commands, appearance options, and focus mode; connect workflow selection to the companion mode controller rather than implementing a second state machine.
- [ ] Preserve input drafts, focus restoration, and underlying agent activity.
- [ ] Support short and narrow windows without inaccessible content.

**Exit:** the inspector is usable while working, and closing or resizing it never loses input.

### Phase 4 — Activity and tool polish

- [ ] Implement clear activity, pending, failure, and settled states.
- [ ] Add optional conflict-aware tool renderer delegation.
- [ ] Support parallel tool rows, structured edit diffs, expanded output, and images.
- [ ] Verify native cancellation, tool exclusions, shell settings, and extension guards remain effective.
- [ ] Validate theme changes and reduced-motion behavior.

**Exit:** improved presentation without changing the agent's execution semantics.

### Phase 5 — Release validation and packaging

- [ ] Run type, unit, rendering, lifecycle, and terminal smoke tests.
- [ ] Test in the user's actual Windows terminal before declaring support.
- [ ] Verify no PHI ANSI output or interaction leaks into print, JSON, or RPC modes.
- [ ] Document compatibility, metric definitions, layout limits, and recovery/disable steps.
- [ ] Verify the npm tarball includes the intended extension/theme resources, not dependencies or private config.
- [ ] Test clean local installation and removal, then prepare screenshots and release notes.

**Exit:** a reproducible, installable package with the requested UI and clearly documented limitations.

## 11. Test and acceptance matrix

| Area | Required cases |
|---|---|
| Metrics | Empty session; known zero; missing usage; partial reasoning; cache denominator zero; small positive costs; attributed plus unattributed reconciliation |
| Sample fixture | Input 10,194 + output 33 + cache read 2,048 + cache write 0 = 12,275; cache rate rounds to 16.7%; context percentage uses a separately configured context window |
| Lifecycle | New, resume, rename, reload, fork, clone, tree navigation, compaction success/failure, retry, shutdown |
| Model history | Multiple providers/models; model selection without use; missing/renamed catalog entries; failed or aborted responses with usage |
| Streaming | Provider reports usage only at completion; partial messages; queued prompts; cancellation; resumed responses without timings |
| Parallel tools | Interleaved updates, out-of-order completion, blocked tools, failures, same-file mutations delegated unchanged |
| Geometry | 40, 60, 80, 100, 120, and 160 columns; short windows; resize during streaming, autocomplete, and expanded inspector |
| Text | ANSI styles, long Windows paths, spaces, emoji, CJK, combining characters, untrusted control sequences |
| Input | Draft preservation, multiline paste, history, file/slash completion, image paste, external editor, IME, cancel, follow-up queue |
| Compatibility | Other editor/footer/tool extensions; regular versus fullscreen; no Git; no model; no credentials; noninteractive modes |
| Resources | No duplicate handlers/timers after repeated reloads; no stale session mutations; no idle animation churn |
| Packaging | Typecheck, tests, clean install, theme discovery, `/reload`, removal, tarball inspection |

Use `@xterm/headless` for terminal-cell/cursor assertions where useful. Supplement snapshots with real terminal smoke tests; headless tests alone do not prove IME, clipboard, images, mouse, or Windows key forwarding.

Planned validation commands after implementation exists:

```bash
npm run typecheck
npm test
npm run test:smoke
npm pack --dry-run
```

The current scripts reference deleted test/source files. These commands are future implementation checks, not a claim that the current scaffold passes.

### Release acceptance checklist

- [ ] `<effective mode> · <actual model>` is visible with the actual provider on the right when width permits; new sessions default to Code.
- [ ] All requested inspector fields exist, with unavailable/estimated/partial states where necessary.
- [ ] Section and model expansion works without breaking prompt input.
- [ ] Context and session usage are not confused; reasoning and copied history are not double-counted.
- [ ] Model subtotals and unattributed usage reconcile with session cost.
- [ ] No false free-cost claim, synthetic generation rate, or unimplemented workflow mode is displayed; mode labels match the tested effective policy.
- [ ] Guard status reflects actual controller/backend evidence, remains visible in focus mode, and never implies that an extension-only check protects against arbitrary host file access.
- [ ] Chat remains readable and unobscured in any advertised docked layout.
- [ ] Native editor, tools, cancellation, sessions, and other extension guards retain their behavior.
- [ ] New session/reload/shutdown leave no stale widgets, watchers, handlers, or timers.
- [ ] The package can be installed, themed, disabled, and removed without altering unrelated settings.

## 12. Open decisions

| Decision | Recommendation | Status |
|---|---|---|
| Terminal and font | Validate the user's actual Windows setup; no required Nerd Font | Not yet supplied |
| Right inspector placement | Docked only if public-API feasibility is proven; otherwise ask before using an overlay | Unresolved architecture gate |
| Regular versus fullscreen | Preserve regular mode; fullscreen is explicit opt-in | Proposed |
| Theme | Midnight, with configurable density and reduced motion | Proposed |
| Workflow modes | Ask, Plan, Code, Debug, Review; Code default; confirmed switches and plan handoff | Approved; specified in [Modes Plan](Modes-Plan.md) |
| Guard runtime | VM/container isolation with required Windows host support | Architecture approved; concrete backend pending validation |
| Guard workspace workflow | Isolated working copy with user-reviewed application back to the real project | Approved; specified in [Guard Plan](Guard-Plan.md) |
| Tool rendering overrides | Optional, compatibility-checked; keep native behavior when conflicts exist | Proposed |

Do not block the documentation on these choices, but resolve the layout gate before investing in a production sidebar.

## 13. Repository and implementation handoff

At planning time, the repository contains `package.json`, `package-lock.json`, `tsconfig.json`, and installed dependencies. Git reports the previous PHI source, theme, README, project settings, and tests as deleted, alongside existing package changes.

- Preserve those user changes. Planning deliverables are `plan/TUI-Plan.md`, `plan/Modes-Plan.md`, and `plan/Guard-Plan.md`; none implements or enables the runtime protections.
- The proposed structure is a future implementation plan, not authorization to restore old code wholesale.
- Keep the existing package entry points (`extensions/phi.ts`, `themes/phi.json`) unless a packaging change is explicitly justified.
- Do not auto-install globally, publish to npm, rewrite project trust, or change terminal settings as part of implementation tests.
- After implementation, document local installation such as `pi install C:/Projects/phi`; this scaffold is not install-ready yet.
- Start with Phase 0, then deliver a reviewable visual shell before adding accounting and optional renderer overrides.

## 14. Technical references

Consult the version-matched installed pi documentation and examples before implementation. The harness documentation was read for this plan; installed type definitions were also checked because documentation and runtime versions can differ.

Documentation under the pi coding-agent installation:

- `docs/extensions.md`: UI hooks, lifecycle, tool delegation, session state, mode guards.
- `docs/tui.md`: components, focus/IME, overlays, width safety, theme invalidation.
- `docs/themes.md`: theme schema and token requirements.
- `docs/packages.md`: manifests, installation, peer/runtime dependencies.
- `docs/keybindings.md`: configured shortcuts and regular/fullscreen differences.
- `docs/settings.md`, `docs/terminal-setup.md`, `docs/windows.md`: terminal and platform behavior.
- `docs/session-format.md`: session entries, usage, branching, and persistence.

Relevant examples:

- `examples/extensions/custom-header.ts`
- `examples/extensions/custom-footer.ts`
- `examples/extensions/border-status-editor.ts`
- `examples/extensions/built-in-tool-renderer.ts`
- `examples/extensions/overlay-test.ts`
- `examples/extensions/working-indicator.ts`

Installed implementation/type references inspected:

- `pi-coding-agent/dist/core/extensions/types.d.ts`
- `pi-coding-agent/dist/core/session-manager.d.ts`
- `pi-coding-agent/dist/core/agent-session.js` and its session-statistics implementation
- `pi-coding-agent/dist/modes/interactive/components/footer.js`
- The resolved `pi-ai/dist/types.d.ts`, especially `Usage.reasoning` as an optional subset of output
- `pi-tui/dist/tui.d.ts` and its layout component declarations

These internal implementation files are references for understanding behavior, not permission to import private internals or patch the live UI.
