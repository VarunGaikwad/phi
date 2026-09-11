"""Guard doctor CLI smoke only. NOT a TUI, Windows, or containment test."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
if NODE is None:
    raise SystemExit("Node.js >=22.19.0 is required for the diagnostic smoke test.")


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


with tempfile.TemporaryDirectory(prefix="phi-preflight-smoke-") as directory:
    # Only synthetic candidates, no model calls or inherited credentials/configuration.
    fixture = Path(directory)
    is_windows = os.name == "nt"
    candidate = fixture / ("docker.cmd" if is_windows else "docker")
    candidate.write_text(
        '@echo FAKE_EXECUTED>"%~dp0must-not-exist"\r\n'
        if is_windows else
        '#!/bin/sh\nprintf FAKE_EXECUTED > "$(dirname "$0")/must-not-exist"\n',
        encoding="utf-8",
    )
    if not is_windows:
        candidate.chmod(0o700)
    env = {"PATH": directory}
    if "SystemRoot" in os.environ:
        env["SystemRoot"] = os.environ["SystemRoot"]
    command = [NODE, "--experimental-transform-types", str(ROOT / "guard-host" / "doctor.ts")]

    for args, expected_code in [([], 2), (["--json"], 2), (["--help"], 0), (["--unguarded"], 64)]:
        result = subprocess.run(
            command + args, cwd=directory, env=env, capture_output=True,
            encoding="utf-8", timeout=15, check=False,
        )
        check(result.returncode == expected_code, "Unexpected doctor exit status")
        if args == ["--json"]:
            report = json.loads(result.stdout)
            check(report["state"] == "locked", "Doctor must remain locked")
            check(report["protection"] == "not-active", "Doctor must not claim active protection")
            check(report["canLaunch"] is False, "Doctor must not authorize launch")
            check(report["validatedBackends"] == [], "No backend has been validated")
            docker = next(tool for tool in report["tooling"]["commands"] if tool["command"] == "docker")
            check(docker["availability"] == "found", "Synthetic candidate should be discovered")
        elif not args:
            check("Protection is NOT active" in result.stdout, "Missing protection warning")
        check(directory not in result.stdout + result.stderr, "Host path leaked into diagnostics")
        check("FAKE_EXECUTED" not in result.stdout + result.stderr, "Candidate output leaked")
        check(not (fixture / "must-not-exist").exists(), "Discovery executed a candidate")

print("PASS: Guard doctor CLI smoke (no TUI or real-backend isolation was tested).")
