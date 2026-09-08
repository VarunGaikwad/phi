import assert from "node:assert/strict";
import { test } from "node:test";
import { assistant, fixture, usage } from "./helpers.ts";

test("totals include assistant, tool and compaction usage without inventing model attribution", () => {
  const { state, session, ctx } = fixture();
  const start = session.appendMessage({ role: "user", content: "Build the interface", timestamp: 0 });
  session.appendMessage(assistant());
  session.appendMessage({ role: "toolResult", toolName: "nested", toolCallId: "test", content: [], isError: false, timestamp: 1, usage: usage() });
  session.appendCompaction("Summary", start, 100, undefined, false, usage());
  state.refreshContext(ctx);
  assert.deepEqual(state.snapshot.tokens, { input: 30, output: 15, cacheRead: 90, cacheWrite: 30 });
  assert.equal(state.snapshot.cachePercent, 60);
  assert.ok(Math.abs(state.snapshot.cost - 0.3) < 1e-10);
  assert.equal(state.snapshot.models.length, 1);
  assert.equal(state.snapshot.models[0].turns, 1);
  assert.equal(state.snapshot.models[0].cost, 0.1);
});

test("branch navigation drops abandoned usage and refreshes the task", () => {
  const { state, session, ctx } = fixture();
  session.appendMessage({ role: "user", content: "First task", timestamp: 0 });
  const first = session.appendMessage(assistant());
  session.appendMessage({ role: "user", content: "Second task", timestamp: 1 });
  session.appendMessage(assistant("model-b"));
  state.refreshContext(ctx);
  assert.equal(state.snapshot.models.length, 2);
  assert.equal(state.snapshot.task, "Second task");
  session.branch(first);
  state.refreshContext(ctx);
  assert.equal(state.snapshot.models.length, 1);
  assert.equal(state.snapshot.cost, 0.1);
  assert.equal(state.snapshot.task, "First task");
});

test("session names win over prompts and can be cleared", () => {
  const { state, session, ctx } = fixture();
  session.appendMessage({ role: "user", content: "Prompt title", timestamp: 0 });
  session.appendSessionInfo("Named session");
  state.refreshContext(ctx);
  assert.equal(state.snapshot.task, "Named session");
  session.appendSessionInfo("");
  state.refreshContext(ctx);
  assert.equal(state.snapshot.task, "Prompt title");
});

test("unknown context and empty usage stay unknown, not a fabricated zero percent", () => {
  const { state, ctx } = fixture();
  ctx.getContextUsage = () => undefined;
  state.refreshContext(ctx);
  assert.equal(state.snapshot.contextTokens, undefined);
  assert.equal(state.snapshot.contextPercent, undefined);
  assert.equal(state.snapshot.cachePercent, null);
  assert.equal(state.snapshot.models[0].turns, 0);
});

test("task metadata strips terminal escapes and render callbacks can be released", () => {
  const { state } = fixture();
  let renders = 0;
  state.bindRender(() => renders++);
  state.setTask("hello\x1b[2J\n world\x1b]0;bad title\x07");
  assert.equal(state.snapshot.task, "hello world");
  assert.equal(renders, 1);
  state.bindRender(undefined);
  state.update({ working: true });
  assert.equal(renders, 1);
});
