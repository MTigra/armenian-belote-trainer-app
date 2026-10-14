#!/usr/bin/env python3
"""Publish only web/dist to gh-pages using an authenticated GitHub CLI."""
import base64
import json
from pathlib import Path
import subprocess

REPOSITORY = "MTigra/armenian-belote-trainer-app"
BRANCH = "gh-pages"
DIST = Path(__file__).resolve().parent.parent / "web" / "dist"


def api(endpoint, payload=None):
    command = ["gh", "api", f"repos/{REPOSITORY}/{endpoint}"]
    if payload is not None:
        command += ["--method", "POST", "--input", "-"]
    result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def publish():
    if not (DIST / "index.html").is_file():
        raise SystemExit("Build the website first: pnpm build:pages")
    index = (DIST / "index.html").read_text()
    if '/armenian-belote-trainer-app/assets/' not in index:
        raise SystemExit("Build with VITE_BASE_PATH=/armenian-belote-trainer-app/ before publishing")
    branches = api("branches?per_page=100")
    previous = next((branch["commit"]["sha"] for branch in branches if branch["name"] == BRANCH), None)
    files = [(str(path.relative_to(DIST)), path.read_bytes())
             for path in sorted(DIST.rglob("*")) if path.is_file()]
    files.append((".nojekyll", b""))
    tree = []
    for name, data in files:
        blob = api("git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})
        tree.append({"path": name, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree_sha = api("git/trees", {"tree": tree})["sha"]
    commit = api("git/commits", {"message": "Publish Blot web client", "tree": tree_sha,
                                  "parents": [previous] if previous else []})
    if previous:
        subprocess.run(["gh", "api", f"repos/{REPOSITORY}/git/refs/heads/{BRANCH}",
                        "--method", "PATCH", "--input", "-"],
                       input=json.dumps({"sha": commit["sha"], "force": False}),
                       text=True, capture_output=True, check=True)
    else:
        api("git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": commit["sha"]})
    print(f"Published {len(files)} static files to {BRANCH} at {commit['sha']}")


if __name__ == "__main__":
    publish()
