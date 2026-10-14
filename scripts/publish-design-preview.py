"""Publish only the isolated design-v3 preview; preserve the live game files."""
import base64
import json
from pathlib import Path
import subprocess

REPOSITORY = "MTigra/armenian-belote-trainer-app"
ROOT = Path(__file__).resolve().parents[1]

def api(endpoint, payload=None, method=None):
    command = ["gh", "api", f"repos/{REPOSITORY}/{endpoint}"]
    if payload is not None:
        command += ["--method", method or "POST", "--input", "-"]
    result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

def publish():
    previous = api("git/ref/heads/gh-pages")["object"]["sha"]
    base_tree = api(f"git/commits/{previous}")["tree"]["sha"]
    files = []
    preview = ROOT / "docs/design-v3"
    for path in sorted(preview.rglob("*")):
        if not path.is_file():
            continue
        data = path.read_bytes()
        files.append((f"design-v3/{path.relative_to(preview).as_posix()}", data))
    for path in sorted((ROOT / "previews/design-v3").glob("*.png")):
        files.append((f"design-v3/previews/{path.name}", path.read_bytes()))
    entries = []
    for name, data in files:
        blob = api("git/blobs", {"content": base64.b64encode(data).decode(), "encoding": "base64"})
        entries.append({"path": name, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    tree = api("git/trees", {"base_tree": base_tree, "tree": entries})["sha"]
    commit = api("git/commits", {"message": "Publish isolated table and centered bidding design preview", "tree": tree, "parents": [previous]})
    api("git/refs/heads/gh-pages", {"sha": commit["sha"], "force": False}, method="PATCH")
    print(f"Published {len(files)} design files, preserving the live app: {commit['sha']}")

if __name__ == "__main__":
    publish()
