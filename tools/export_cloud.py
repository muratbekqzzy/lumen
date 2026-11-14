#!/usr/bin/env python3
"""Export an existing macOS Lumen knowledge vault to a browser-importable JSON backup.

Runs locally. No network request is made. No recordings or PDFs are exported.
Usage: uv run python tools/export_cloud.py [output.json]
"""
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

import yaml

VAULT = Path(os.environ.get("LUMEN_VAULT", "~/Knowledge")).expanduser()
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "lumen-cloud-import.json").expanduser()
SKIP = {".git", ".media", "Source", ".DS_Store", "__pycache__"}
def millis(value, fallback):
    try:
        return int(dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000)
    except (TypeError, ValueError):
        return fallback

def read_meta(folder):
    p = folder / ".lumen.json"
    if not p.exists(): return {}
    try: return json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError): return {}

def note_text(file):
    raw = file.read_text(encoding="utf-8", errors="replace")
    fm = {}
    if raw.startswith("---\n"):
        match = re.search(r"\n---(?:\n|$)", raw[4:])
        if match:
            index = 4 + match.start()
            try: fm = yaml.safe_load(raw[4:index]) or {}
            except yaml.YAMLError: fm = {}
            raw = raw[index + len(match.group(0)):]
    return fm if isinstance(fm, dict) else {}, raw.strip()

def main():
    if not VAULT.is_dir():
        raise SystemExit(f"Vault folder not found: {VAULT}")
    stamp = int(dt.datetime.now().timestamp() * 1000)
    data = {"version": 1, "records": {}, "deleted": {}}
    ids = set()
    for ident, title in (("root", "Knowledge"), ("inbox", "Inbox"), ("archive", "Archive")):
        data["records"][ident] = {"id": ident, "kind": ident, "title": title, "parent": None, "created": stamp, "updated": stamp}
        ids.add(ident)
    def unique(i):
        candidate = str(i)
        if candidate in ids:
            raise ValueError(f"Duplicate Lumen id: {candidate}. Resolve duplicates before importing.")
        ids.add(candidate)
        return candidate
    def walk(folder, parent, depth):
        meta = read_meta(folder)
        raw_kind = meta.get("kind")
        kind = raw_kind if raw_kind in ("section","module","lecture") else ("section" if depth == 1 else "module")
        ident = str(meta.get("id") or "folder_" + str(abs(hash(str(folder)))))
        unique(ident)
        stat = folder.stat()
        created = millis(meta.get("created"), int(stat.st_ctime * 1000))
        updated = millis(meta.get("updated"), int(stat.st_mtime * 1000))
        node = {"id": ident, "kind": kind, "title": meta.get("title") or folder.name,
                "parent": parent, "created": created, "updated": updated,
                "icon": meta.get("icon", ""), "color": meta.get("color", ""),
                "type": meta.get("type", ""), "description": meta.get("description", "")}
        if kind == "lecture":
            generated = {}
            for sub in ("Generated", "My Notes"):
                d = folder / sub
                if d.is_dir():
                    for f in sorted(d.glob("*.md")):
                        _, body = note_text(f)
                        if sub == "Generated": generated[f.name] = body
                        elif f.name == "notes.md": node["body"] = body
            node["generated"] = generated
            node["status"] = meta.get("status", "complete")
            node["lecturer"] = meta.get("lecturer", "")
            node["date"] = meta.get("date", "")
            node["panopto_url"] = meta.get("panopto_url", "")
        data["records"][ident] = node
        if kind != "lecture":
            visit(folder, ident, depth)
    def visit(folder, parent, depth):
        meta = read_meta(folder)
        order = {i: n for n, i in enumerate(meta.get("order", []))}
        items = []
        for child in folder.iterdir():
            if child.name in SKIP or child.name.startswith(".") or child.is_symlink(): continue
            if child.is_dir(): items.append(child)
            elif child.is_file() and child.suffix.lower() == ".md" and child.name != "README.md": items.append(child)
        for child in items:
            if child.is_dir():
                child_meta = read_meta(child)
                child_id = str(child_meta.get("id") or "folder_" + str(abs(hash(str(child)))))
            else:
                fm, _ = note_text(child)
                child_id = str(fm.get("id") or "note_" + str(abs(hash(str(child)))))
            if child.is_dir():
                walk(child, parent, depth + 1)
            else:
                fm, body = note_text(child)
                unique(child_id)
                stat = child.stat()
                data["records"][child_id] = {
                    "id": child_id, "kind": "note", "parent": parent,
                    "title": fm.get("title") or child.stem, "body": body,
                    "author": fm.get("author", "you"),
                    "created": millis(fm.get("created"), int(stat.st_ctime * 1000)),
                    "updated": millis(fm.get("updated"), int(stat.st_mtime * 1000))
                }
            data["records"][child_id]["position"] = order.get(child_id, len(order) + items.index(child))
    for key, name in (("inbox", "Inbox"), ("archive", "Archive")):
        folder = VAULT / name
        if folder.is_dir(): visit(folder, key, 0)
    visit(VAULT, "root", 0)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(data['records'])} items to {OUT.resolve()}")
    print("Recordings, PDFs, secrets and Git history were not exported.")
    print("Import using Lumen Cloud → Sync settings → Import backup.")

if __name__ == "__main__": main()
