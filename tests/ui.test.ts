import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CombinedAutocompleteProvider, CURSOR_MARKER, HStack, ScrollView, Text, VStack, stripTerminalSequences, visibleWidth, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "../node_modules/@earendil-works/pi-tui/dist/layout.js";
import { VIEWPORT_TUI } from "../node_modules/@earendil-works/pi-tui/dist/tui.js";
import { validateThemeJson } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-json.js";
import { PhiFooter } from "../extensions/phi/editor.ts";
import { between, plainText, surface } from "../extensions/phi/format.ts";
import { PhiLayoutHost } from "../extensions/phi/layout.ts";
import { PhiSidebar } from "../extensions/phi/sidebar.ts";
import { editorFixture, fixture, theme } from "./helpers.ts";

const text = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");
const fits = (lines: string[], width: number) => lines.forEach(line => assert.ok(visibleWidth(line) <= width, `Row exceeds ${width}: ${stripTerminalSequences(line)}`));
const mouse = (x: number, y: number, width: number, type: TuiMouseEvent["type"] = "click"): TuiMouseEvent =>
  ({ x, y, width, height: 42, screenX: x, screenY: y, type, button: "left", shift: false, alt: false, ctrl: false, clickCount: 1 });

test("theme validates against Pi's actual schema", () => {
  assert.doesNotThrow(() => validateThemeJson("phi", JSON.parse(readFileSync(new URL("../themes/phi.json", import.meta.url), "utf8"))));
});

test("metadata formatting is ANSI-safe and keeps the right-aligned value", () => {
  const line = between(theme.fg("muted", "A very long model label"), theme.fg("text", "$0.12"), 18);
  assert.equal(visibleWidth(line), 18);
  assert.ok(stripTerminalSequences(line).endsWith("$0.12"));
  assert.equal(plainText("a\x1b]8;;https://example.com\x07b\x1b]8;;\x07\n c"), "ab c");
  assert.ok(surface(theme, "customMessageBg", "\x1b[7m \x1b[0m x", 10).includes("\x1b[0m" + theme.getBgAnsi("customMessageBg")));
});

test("editor keeps cursor markers and fits Unicode/multiline text at every width", () => {
  const { editor } = editorFixture();
  const input = "Hello 世界 👩‍💻\nA second line";
  editor.setText(input);
  for (const width of [1, 2, 4, 5, 12, 24, 80, 100, 160]) {
    const lines = editor.render(width);
    fits(lines, width);
    if (width >= 12) assert.ok(lines.some(line => line.includes(CURSOR_MARKER)));
  }
  assert.equal(editor.getText(), input);
  assert.match(text(editor.render(100)), /Create.*Model A.*Ready/);
  assert.ok(!text(editor.render(100)).includes("────"));
});

test("mouse positioning accounts for the input rail", () => {
  const { editor } = editorFixture();
  editor.setText("abcdef");
  editor.render(80);
  const result = editor.handleMouse(mouse(6, 1, 80));
  assert.equal(result?.focus, true);
  assert.equal(editor.getCursor().col, 3);
});

test("autocomplete stays below the model row and supports mouse selection", async () => {
  const { editor } = editorFixture();
  editor.setAutocompleteProvider(new CombinedAutocompleteProvider([{ name: "model", description: "Select model" }, { name: "phi-mode", description: "Change mode" }], process.cwd()));
  editor.handleInput("/");
  await delay(100);
  const lines = editor.render(80);
  assert.equal(editor.isShowingAutocomplete(), true);
  assert.match(text(lines.slice(3)), /model/);
  fits(lines, 80);
  editor.handleMouse(mouse(5, 3, 80));
  assert.match(editor.getText(), /^\/model/);
});

test("native app controls, submission, large paste and history still work", () => {
  const { editor } = editorFixture();
  let aborted = 0, selected = 0, exited = 0;
  let submitted = "";
  editor.onEscape = () => aborted++;
  editor.onCtrlD = () => exited++;
  editor.onAction("app.model.select", () => selected++);
  editor.onSubmit = value => { submitted = value; };
  editor.handleInput("\x1b");
  editor.handleInput("\x0c");
  editor.handleInput("\x04");
  assert.deepEqual([aborted, selected, exited], [1, 1, 1]);
  editor.setText("hello");
  editor.handleInput("\n");
  editor.handleInput("world");
  editor.handleInput("\r");
  assert.equal(submitted, "hello\nworld");
  editor.addToHistory(submitted);
  editor.setText("");
  editor.handleInput("\x1b[A");
  assert.equal(editor.getText(), submitted);
  editor.setText("");
  const paste = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  editor.handleInput(`\x1b[200~${paste}\x1b[201~`);
  assert.equal(editor.getExpandedText(), paste);
  assert.match(editor.getText(), /paste/);
});

test("long editor content keeps native scroll hints and live working status", () => {
  const { editor, state } = editorFixture();
  editor.setText(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"));
  assert.match(text(editor.render(80)), /↑ \d+ more/);
  state.update({ working: true });
  assert.match(text(editor.render(80)), /Working/);
});

test("sidebar paints full-height surfaces, pins project footer, and scrolls independently", () => {
  const { state } = fixture();
  state.update({ branch: "main", task: "Recreate the reference terminal workspace", files: Array.from({ length: 20 }, (_, i) => ({ status: "M", path: `src/file-${i}.ts` })) });
  for (const height of [1, 8, 18, 32, 48, 80]) {
    const sidebar = new PhiSidebar(state, () => theme, () => height);
    for (const width of [1, 2, 8, 24, 32]) {
      const lines = sidebar.render(width);
      assert.equal(lines.length, height);
      fits(lines, width);
      assert.ok(lines.every(line => line.startsWith(theme.getBgAnsi("customMessageBg"))));
    }
  }
  const sidebar = new PhiSidebar(state, () => theme, () => 24);
  const before = sidebar.render(32);
  assert.match(text(before), /Context/);
  assert.match(text(before), /scroll for more/);
  assert.match(text(before.slice(-4)), /workspace\/phi:main/);
  assert.equal(sidebar.handleMouse({ ...mouse(5, 5, 32, "wheel"), wheelDelta: 100 })?.handled, true);
  const after = sidebar.render(32);
  assert.match(text(after), /MCP/);
  assert.equal(text(after.slice(-4)), text(before.slice(-4)));
});

test("footer shows context, actual command hint, and statuses from other extensions", () => {
  const { state } = fixture();
  const footer = new PhiFooter(state, () => theme, () => new Map([["phi", "create"], ["other", "Build passing"]]));
  for (const width of [1, 10, 40, 80, 160]) fits(footer.render(width), width);
  assert.match(text(footer.render(100)), /13k \(7%\).*\/ commands/);
  assert.match(text(footer.render(100)), /Build passing/);
  state.update({ working: true });
  assert.match(text(footer.render(100)), /interrupt/);
});

test("fullscreen layout reserves sidebar space without replacing native scrolling", () => {
  const { editor, state } = editorFixture();
  const scroll = new ScrollView(new Text("Native transcript", 1, 0), { primary: true, follow: "end" });
  const baseRoot = new VStack([{ component: scroll, basis: 0, grow: 1 }, editor]);
  const hostTui = {
    [VIEWPORT_TUI]: true, mode: "fullscreen", terminal: { columns: 132, rows: 42 }, layoutRoot: baseRoot as Component,
    setLayoutRoot(root: Component) { this.layoutRoot = root; }, requestRender() {},
  };
  const host = new PhiLayoutHost(hostTui as unknown as TUI, () => theme, state);
  assert.ok(hostTui.layoutRoot instanceof HStack);
  for (const [width, sidebarWidth] of [[80, 0], [95, 0], [96, 24], [131, 24], [132, 32], [160, 32]]) {
    hostTui.terminal.columns = width;
    const frame = renderLayoutFrame(hostTui.layoutRoot, width, 42, () => {});
    fits(frame.lines, width);
    assert.equal(frame.primaryScrollView, scroll);
    assert.equal(frame.root.children[0].rect.width, width - sidebarWidth);
    assert.equal(text(frame.lines).includes("Token Usage"), sidebarWidth > 0);
  }
  host.toggle();
  assert.equal(renderLayoutFrame(hostTui.layoutRoot, 132, 42, () => {}).root.children.length, 1);
  host.dispose();
  assert.equal(hostTui.layoutRoot, baseRoot);
});

test("queued layout reinstalls cannot resurrect the sidebar after disposal", async () => {
  const { state } = fixture();
  const base = new Text("native");
  const hostTui = { [VIEWPORT_TUI]: true, mode: "fullscreen", terminal: { rows: 24 }, layoutRoot: base as Component,
    setLayoutRoot(root: Component) { this.layoutRoot = root; }, requestRender() {} };
  const host = new PhiLayoutHost(hostTui as unknown as TUI, () => theme, state);
  hostTui.layoutRoot = base;
  host.render(100);
  host.dispose();
  await Promise.resolve();
  assert.equal(hostTui.layoutRoot, base);
});
