"""Exercise the actual Pi CLI in an isolated PTY; no model requests or user config."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parent.parent

with tempfile.TemporaryDirectory(prefix="phi-smoke-") as directory:
    work = Path(directory)
    project = work / "workspace" / "phi"
    project.mkdir(parents=True)
    agent = work / "agent"
    agent.mkdir()
    (agent / "settings.json").write_text(json.dumps({"quietStartup": True, "enableInstallTelemetry": False}))
    session = work / "session.jsonl"
    usage = {"input": 870, "output": 102, "cacheRead": 37840, "cacheWrite": 0, "totalTokens": 38812,
             "cost": {"input": 0.002, "output": 0.001, "cacheRead": 0.001, "cacheWrite": 0, "total": 0.004}}
    stamp = "2026-01-01T00:00:00.000Z"
    entries = [
        {"type": "session", "version": 3, "id": "00000000-0000-0000-0000-000000000001", "timestamp": stamp, "cwd": str(project)},
        {"type": "message", "id": "00000001", "parentId": None, "timestamp": stamp,
         "message": {"role": "user", "content": "Recreate this kind of UI for my Pi coding agent.", "timestamp": 0}},
        {"type": "message", "id": "00000002", "parentId": "00000001", "timestamp": stamp,
         "message": {"role": "assistant", "content": [{"type": "text", "text": "A quiet workspace, with your conversation on the left and session details on the right.\n\n- Near-black surfaces with a soft blue accent\n- Live context, token usage and model statistics\n- Pi's native editor, autocomplete and controls"}],
                     "api": "openai-responses", "provider": "openai", "model": "gpt-4o", "usage": usage, "stopReason": "stop", "timestamp": 1}},
        {"type": "session_info", "id": "00000003", "parentId": "00000002", "timestamp": stamp, "name": "Recreate a quiet coding workspace"},
    ]
    session.write_text("\n".join(json.dumps(entry) for entry in entries) + "\n")
    env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor", "PI_CODING_AGENT_DIR": str(agent),
           "PI_OFFLINE": "1", "PI_TELEMETRY": "0", "PHI_TYPESCRIPT_LSP": str(work / "missing-lsp")}
    env.pop("NO_COLOR", None)
    executable = shutil.which("pi") or str(ROOT / "node_modules" / ".bin" / "pi")
    command = [executable, "--offline", "--no-extensions", "-e", str(ROOT / "extensions/phi.ts"),
               "--no-themes", "--theme", str(ROOT / "themes/phi.json"), "--use-theme", "phi",
               "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve",
               "--tui-mode", "fullscreen", "--provider", "openai", "--model", "gpt-4o", "--session", str(session)]
    master, slave = pty.openpty()
    columns, rows = 144, 44
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    process = subprocess.Popen(command, cwd=project, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    frames = []

    def capture(name, seconds=1.0):
        data = bytearray()
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.05)[0]:
                try:
                    data.extend(os.read(master, 65536))
                except OSError:
                    break
        frames.append({"name": name, "columns": columns, "rows": rows, "data": data.decode("utf8", errors="replace")})
        if process.poll() is not None:
            raise RuntimeError(f"Pi exited early ({process.returncode}): {frames[-1]['data']}")

    def send(value):
        os.write(master, value.encode())

    try:
        capture("initial", 5)
        send("/phi-mode plan\r")
        capture("plan")
        send("/phi-sidebar\r")
        capture("hidden")
        send("/phi-sidebar\r")
        capture("shown")
        send("/reload\r")
        capture("reloaded", 3)
        send("/mod")
        capture("autocomplete")
        send("\x1b")  # Close autocomplete, then clear without submitting a prompt.
        send("\x03")
        capture("cleared")
        columns, rows = 80, 24
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
        os.kill(process.pid, signal.SIGWINCH)
        capture("narrow")
        columns, rows = 144, 44
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
        os.kill(process.pid, signal.SIGWINCH)
        capture("wide")
        result_file = work / "frames.json"
        result_file.write_text(json.dumps(frames))
        subprocess.run(["node", str(ROOT / "tests/assert-smoke.mjs"), str(result_file)], check=True, cwd=ROOT)
    finally:
        if process.poll() is None:
            send("\x03/quit\r")
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        os.close(master)
