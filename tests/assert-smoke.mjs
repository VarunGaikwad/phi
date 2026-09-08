import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import xterm from "@xterm/headless";
const { Terminal } = xterm;

const frames = JSON.parse(readFileSync(process.argv[2], "utf8"));
const term = new Terminal({ cols: frames[0].columns, rows: frames[0].rows, allowProposedApi: true });
const screens = new Map();
for (const frame of frames) {
  term.resize(frame.columns, frame.rows);
  await new Promise(resolve => term.write(frame.data, resolve));
  const buffer = term.buffer.active;
  const lines = Array.from({ length: frame.rows }, (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true) || "");
  const text = lines.join("\n");
  screens.set(frame.name, text);
  if (frame.name === "initial") console.log(text);
  assert.doesNotMatch(text, /Failed to load extension|Extension error|Maximum call stack|TypeError:/, frame.name);
  if (frame.name === "initial" || frame.name === "wide") {
    assert.match(text, /Token Usage/, frame.name);
    assert.match(text, /Cache read/, frame.name);
    assert.match(text, /Recreate a quiet coding/, frame.name);
    assert.match(text, /Ready/, frame.name);
    assert.match(lines.slice(-4).join("\n"), /φ PHI/, frame.name);
    const sidebarCell = buffer.getLine(buffer.viewportY + 20)?.getCell(frame.columns - 1);
    assert.equal(sidebarCell?.getBgColor(), 0x111113, "sidebar fills its full height");
    // No cursor drift into the sidebar from the added editor rail.
    assert.ok(buffer.cursorX < frame.columns - 32, "cursor stays in chat pane");
  }
}
assert.match(screens.get("plan"), /Plan.*Ready/);
assert.doesNotMatch(screens.get("hidden"), /Token Usage/);
assert.match(screens.get("shown"), /Token Usage/);
assert.match(screens.get("reloaded"), /Token Usage/);
assert.match(screens.get("autocomplete"), /\/model/);
assert.doesNotMatch(screens.get("narrow"), /Token Usage/);
assert.match(screens.get("narrow"), /Ready/);
console.log("\nPi PTY smoke checks passed: startup, modes, toggle, reload, autocomplete and resize.");
term.dispose();
