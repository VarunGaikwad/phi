# PHI for Pi

A quiet, fullscreen interface for the Pi coding agent, inspired by the reference terminal UI: near-black surfaces, muted text, a slim blue input rail, and a fixed right sidebar. Includes session file tracking, optional TypeScript LSP tools, and MCP client support.

## Interface

PHI keeps Pi's native transcript, autocomplete, sessions, and dialogs in the left pane. Its custom editor extends Pi's editor rather than replacing its editing behavior: multiline input, paste, history, mouse positioning, model selection, and abort shortcuts still work.

The sidebar shows:
- Session title and ID
- Context usage, token/cache totals, and estimated cost
- Models used, assistant turns, and per-model cost
- Files changed during this session, LSP status, and MCP connections
- Project path, Git branch, and Pi version pinned at the bottom

The input's bottom row shows the mode, model, provider (when space allows), and real Ready/Working state. No simulated sandbox, account balance, or indexing indicators.

PHI's read guard blocks native `read`, `grep`, and `find` calls into dependency, generated, cache, VCS, and credential directories/files so they do not fill the model context unnecessarily. Set `PHI_READ_GUARD=off` to disable it.

- `Ctrl+Alt+B` or `/phi-sidebar`: toggle the sidebar
- `Ctrl+Alt+M` or `/phi-mode`: cycle create, plan, and review modes
- Scroll over the sidebar to see additional sections in short windows; chat stays put
- Below 96 columns the sidebar hides automatically; it is 24 columns wide up to 131 columns, then 32 columns wide
- `/hotkeys`: Pi's native keyboard shortcut reference

Usage totals follow the active session branch and include reported nested-tool and summary usage. Per-model rows include only identifiable assistant usage; provider costs are estimates, not billing balances. Unknown context/cache usage is shown as unavailable rather than a fabricated percentage.

## Run

```bash
npm install
pi
```

Trust this project when Pi asks so `.pi/settings.json` can load the package. If Pi is already running here, use **`/reload`** to apply the updated extension.

To use PHI in other projects, install this local package with `pi install /absolute/path/to/phi` and enable fullscreen mode there.

## Terminal appearance

The package applies the `phi` theme at runtime. For the closest match, set your terminal background to **`#0b0b0c`** and foreground to **`#c6c6cb`**. Font, window chrome, and the background of unused transcript space belong to your terminal, not Pi. A monospace font and a window at least 132 columns wide work well.

### Ghostty

```ini
background = 0b0b0c
foreground = c6c6cb
```

### VS Code

```json
{
  "workbench.colorCustomizations": {
    "terminal.background": "#0B0B0C",
    "terminal.foreground": "#C6C6CB"
  },
  "terminal.integrated.minimumContrastRatio": 1
}
```

The split layout requires Pi's fullscreen mode. The theme and editor also work in regular mode, without a sidebar. This repository enables fullscreen in `.pi/settings.json`; other installations should set:

```json
{ "tuiMode": "fullscreen" }
```

## TypeScript LSP

PHI detects `typescript-language-server` but never installs language servers automatically:

```bash
npm install -g typescript typescript-language-server
```

Override the executable when necessary:

```bash
export PHI_TYPESCRIPT_LSP=/path/to/typescript-language-server
```

Read-only tools are registered for diagnostics, hover information, definitions, references, and document symbols. If the executable is unavailable, the sidebar reports `TypeScript missing` and tool calls return a clear error.

## MCP

PHI reads Claude-compatible `mcpServers` configuration from:

- `~/.pi/agent/mcp.json`
- `.pi/mcp.json` for trusted projects

Project entries override global entries with the same name.

### Stdio server

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"],
      "env": {}
    }
  }
}
```

### Streamable HTTP server

```json
{
  "mcpServers": {
    "remote": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

Discovered tools are registered as `mcp__<server>__<tool>`. Tools explicitly annotated as read-only remain available in plan/review mode; all other MCP tools are blocked outside create mode.

MCP commands run with your user permissions. Only configure servers you trust, and avoid committing secrets in project configuration.

## Modified files

PHI snapshots the Git working tree when a session starts. The sidebar then shows current files changed relative to that baseline, excluding pre-existing dirty files unless their content changes during the session. Direct `edit` and `write` operations are also tracked for non-Git projects.

## Development

```bash
npm install
npm run typecheck
npm test
npm run test:smoke
npm pack --dry-run
```

Unit tests use Node's TypeScript transform support (Node 22.13+ or 24+). The optional smoke test needs Python 3, a POSIX PTY, and Pi installed. It launches the real CLI with isolated settings and a fixture session, makes no model requests, and checks startup, mode switching, sidebar toggling, reload, autocomplete, and resizing with a headless terminal.

The split layout targets Pi 0.85.1 or newer. Pi currently exposes fullscreen root replacement but not a root getter, so the small compatibility adapter is isolated in `extensions/phi/layout.ts` and restores the original root when PHI unloads.
