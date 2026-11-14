"""The knowledge vault: plain folders + Markdown, versioned with git.

Layout (everything is human-readable and works without this app):

    ~/Knowledge/
      .lumen.json            root metadata (order of sections)
      Inbox/                 unsorted captures and new lectures
      Archive/               nothing is ever deleted - it moves here
      <Section>/
        .lumen.json          {id, kind: "section", title, icon, color, order, ...}
        <Module>/            modules can nest inside modules
          .lumen.json
          Some note.md       notes carry YAML front matter with a stable id
          <Lecture>/
            .lumen.json      {kind: "lecture", panopto_url, ...}
            Source/          originals - never modified by AI
            Generated/       AI study material - regenerable
            My Notes/        yours - AI never overwrites
    ~/Knowledge/.media/      large recordings (not in git; backed up by Time Machine)

Every change is a git commit, so any change can be undone.
"""
from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
import re
import secrets
import shutil
import subprocess
from contextlib import contextmanager
from pathlib import Path

import yaml

VAULT = Path(os.environ.get("LUMEN_VAULT", Path.home() / "Knowledge")).expanduser()
META = ".lumen.json"
INBOX, ARCHIVE, MEDIA = "Inbox", "Archive", ".media"
LECTURE_PARTS = ("Source", "Generated", "My Notes")
SKIP = {".git", MEDIA, ".DS_Store"}
CONTAINER_KINDS = {"root", "inbox", "archive", "section", "module"}


class VaultError(Exception):
    pass


# ---------------------------------------------------------------- helpers

def now() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def safe_name(title: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", title).strip().strip(".")
    return (name or "Untitled")[:120]


def unique_path(parent: Path, name: str, suffix: str = "") -> Path:
    p = parent / f"{name}{suffix}"
    i = 2
    while p.exists():
        p = parent / f"{name} ({i}){suffix}"
        i += 1
    return p


def read_meta(folder: Path) -> dict:
    f = folder / META
    if f.exists():
        try:
            return json.loads(f.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def write_meta(folder: Path, meta: dict) -> None:
    (folder / META).write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")


def split_front_matter(text: str) -> tuple[dict, str]:
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            try:
                fm = yaml.safe_load(text[4:end]) or {}
                body = text[end + 4:].lstrip("\n")
                return (fm if isinstance(fm, dict) else {}), body
            except yaml.YAMLError:
                pass
    return {}, text


def join_front_matter(fm: dict, body: str) -> str:
    return "---\n" + yaml.safe_dump(fm, allow_unicode=True, sort_keys=False) + "---\n\n" + body.rstrip() + "\n"


# ---------------------------------------------------------------- git

@contextmanager
def _lock():
    VAULT.mkdir(parents=True, exist_ok=True)
    with open(VAULT / ".git" / "lumen.lock" if (VAULT / ".git").exists() else VAULT / ".lumen.lock", "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _git(*args: str, check: bool = True) -> str:
    r = subprocess.run(["git", "-C", str(VAULT), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise VaultError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def commit(message: str) -> None:
    _git("add", "-A")
    if _git("status", "--porcelain").strip():
        _git("-c", "user.name=Lumen", "-c", "user.email=lumen@localhost", "commit", "-q", "-m", message)


def history(limit: int = 30) -> list[dict]:
    out = _git("log", f"-{limit}", "--pretty=format:%h\x1f%ad\x1f%s", "--date=iso-strict", check=False)
    rows = []
    for line in out.splitlines():
        h, d, s = line.split("\x1f", 2)
        rows.append({"hash": h, "date": d, "message": s})
    return rows


def undo_last() -> str:
    """Reverse the most recent change (itself recorded as a new change)."""
    with _lock():
        log = history(1)
        if not log or log[0]["message"].startswith("Initialise"):
            raise VaultError("Nothing to undo")
        _git("-c", "user.name=Lumen", "-c", "user.email=lumen@localhost", "revert", "--no-edit", "HEAD")
        return log[0]["message"]


# ---------------------------------------------------------------- init

def init() -> None:
    VAULT.mkdir(parents=True, exist_ok=True)
    fresh = not (VAULT / ".git").exists()
    if fresh:
        _git("init", "-q", "-b", "main")
        (VAULT / ".gitignore").write_text(".media/\n.DS_Store\n.lumen.lock\n")
    if not read_meta(VAULT):
        write_meta(VAULT, {"id": "root", "kind": "root", "title": "Knowledge", "order": [], "created": now()})
    for name, kind in ((INBOX, "inbox"), (ARCHIVE, "archive")):
        d = VAULT / name
        d.mkdir(exist_ok=True)
        if not read_meta(d):
            write_meta(d, {"id": kind, "kind": kind, "title": name, "order": [], "created": now()})
    (VAULT / MEDIA).mkdir(exist_ok=True)
    readme = VAULT / "README.md"
    if not readme.exists():
        readme.write_text(
            "# Knowledge\n\nYour lifelong learning vault, managed by Lumen.\n\n"
            "Everything here is plain folders and Markdown. Sections and modules are folders;\n"
            "`.lumen.json` files hold their order, icons and stable ids. Lectures keep\n"
            "`Source/` (originals), `Generated/` (AI study material) and `My Notes/` (yours).\n"
            "Every change is a git commit, so nothing is ever lost.\n"
        )
    with _lock():
        commit("Initialise vault" if fresh else "Vault check")


# ---------------------------------------------------------------- scanning

def _adopt(folder: Path, depth: int) -> dict:
    """Give a folder created outside Lumen (e.g. in Finder) its metadata."""
    meta = read_meta(folder)
    if not meta.get("id"):
        kind = "section" if depth == 1 else "module"
        meta = {"id": new_id(kind[0]), "kind": kind, "title": folder.name, "order": [], "created": now(), **meta}
        write_meta(folder, meta)
    return meta


def _note_info(path: Path) -> dict:
    fm, body = split_front_matter(path.read_text(errors="replace"))
    if not fm.get("id"):
        fm = {"id": new_id("n"), "title": path.stem, "created": now(), "author": "you", **fm}
        path.write_text(join_front_matter(fm, body))
    return {"id": fm["id"], "kind": "note", "title": fm.get("title") or path.stem,
            "author": fm.get("author", "you"), "updated": fm.get("updated") or fm.get("created")}


def scan() -> tuple[dict, dict[str, Path]]:
    """Return (tree, index id -> path). Adopts any unknown folders/notes."""
    index: dict[str, Path] = {}

    def walk(folder: Path, depth: int) -> dict:
        meta = read_meta(folder) if depth == 0 or folder.name in (INBOX, ARCHIVE) and depth == 1 else _adopt(folder, depth)
        node = {k: v for k, v in meta.items() if k != "order"}
        node["path"] = str(folder.relative_to(VAULT)) if folder != VAULT else ""
        index[meta["id"]] = folder
        if meta.get("kind") == "lecture":
            node["children"] = []
            return node
        children = []
        for child in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
            if child.name in SKIP or child.name.startswith("."):
                continue
            if child.is_dir():
                if depth == 0 and child.name in (INBOX, ARCHIVE):
                    continue
                children.append(walk(child, depth + 1))
            elif child.suffix.lower() == ".md" and not (depth == 0 and child.name == "README.md"):
                info = _note_info(child)
                info["path"] = str(child.relative_to(VAULT))
                index[info["id"]] = child
                children.append(info)
        order = meta.get("order", [])
        rank = {cid: i for i, cid in enumerate(order)}
        children.sort(key=lambda c: (rank.get(c["id"], len(rank)), c["title"].lower()))
        node["children"] = children
        return node

    tree = walk(VAULT, 0)
    tree["inbox"] = walk(VAULT / INBOX, 1)
    tree["archive"] = walk(VAULT / ARCHIVE, 1)
    return tree, index


def resolve(node_id: str) -> Path:
    _, index = scan()
    if node_id not in index:
        raise VaultError(f"Unknown item: {node_id}")
    return index[node_id]


def kind_of(path: Path) -> str:
    if path.is_file():
        return "note"
    return read_meta(path).get("kind", "module")


def parent_container(path: Path) -> Path:
    return path.parent


def _set_order(folder: Path, ids: list[str]) -> None:
    meta = read_meta(folder)
    meta["order"] = ids
    write_meta(folder, meta)


def _append_order(folder: Path, node_id: str, index: int | None = None) -> None:
    meta = read_meta(folder)
    order = [i for i in meta.get("order", []) if i != node_id]
    order.insert(len(order) if index is None else max(0, min(index, len(order))), node_id)
    meta["order"] = order
    write_meta(folder, meta)


def _remove_order(folder: Path, node_id: str) -> None:
    meta = read_meta(folder)
    meta["order"] = [i for i in meta.get("order", []) if i != node_id]
    write_meta(folder, meta)


def _id_of(path: Path) -> str:
    if path.is_file():
        return split_front_matter(path.read_text(errors="replace"))[0].get("id", "")
    return read_meta(path).get("id", "")


# ---------------------------------------------------------------- structure (you only)

def create_container(parent_id: str, title: str, icon: str = "", color: str = "", type_: str = "") -> dict:
    with _lock():
        parent = VAULT if parent_id in ("", "root") else resolve(parent_id)
        pkind = kind_of(parent)
        if pkind not in ("root", "section", "module"):
            raise VaultError("Sections and modules can only be created at the top level or inside another section/module")
        kind = "section" if pkind == "root" else "module"
        folder = unique_path(parent, safe_name(title))
        folder.mkdir()
        meta = {"id": new_id(kind[0]), "kind": kind, "title": title.strip(), "icon": icon, "color": color,
                "type": type_, "description": "", "order": [], "created": now()}
        write_meta(folder, meta)
        _append_order(parent, meta["id"])
        commit(f"Create {kind} '{title}'")
        return meta


def update_container(node_id: str, **fields) -> dict:
    with _lock():
        folder = resolve(node_id)
        if folder.is_file():
            raise VaultError("Use update_note for notes")
        meta = read_meta(folder)
        allowed = {"icon", "color", "type", "description"}
        meta.update({k: v for k, v in fields.items() if k in allowed and v is not None})
        write_meta(folder, meta)
        commit(f"Update '{meta.get('title')}'")
        return meta


def rename(node_id: str, title: str) -> dict:
    with _lock():
        path = resolve(node_id)
        title = title.strip()
        if not title:
            raise VaultError("Title cannot be empty")
        if path.is_file():
            fm, body = split_front_matter(path.read_text())
            old = fm.get("title", path.stem)
            fm["title"], fm["updated"] = title, now()
            path.write_text(join_front_matter(fm, body))
            if safe_name(title) != path.stem:
                path.rename(unique_path(path.parent, safe_name(title), ".md"))
        else:
            if kind_of(path) in ("root", "inbox", "archive"):
                raise VaultError("This folder can't be renamed")
            meta = read_meta(path)
            old = meta.get("title")
            meta["title"] = title
            write_meta(path, meta)
            if safe_name(title) != path.name:
                path.rename(unique_path(path.parent, safe_name(title)))
        commit(f"Rename '{old}' to '{title}'")
        return {"id": node_id, "title": title}


def reorder(parent_id: str, ordered_ids: list[str]) -> None:
    with _lock():
        parent = VAULT if parent_id in ("", "root") else resolve(parent_id)
        _set_order(parent, ordered_ids)
        commit(f"Reorder '{read_meta(parent).get('title', 'Knowledge')}'")


def move(node_id: str, new_parent_id: str, index: int | None = None) -> dict:
    """Move anything anywhere. Top level = section; inside a section/module = module."""
    with _lock():
        _, idx = scan()
        if node_id not in idx:
            raise VaultError(f"Unknown item: {node_id}")
        src = idx[node_id]
        dest = VAULT if new_parent_id in ("", "root") else idx.get(new_parent_id)
        if dest is None:
            raise VaultError(f"Unknown destination: {new_parent_id}")
        skind, dkind = kind_of(src), kind_of(dest)
        if skind in ("root", "inbox", "archive"):
            raise VaultError("This folder can't be moved")
        if dkind not in CONTAINER_KINDS:
            raise VaultError("You can only move items into a section, module or the Inbox")
        if dkind == "root" and skind in ("note", "lecture"):
            raise VaultError("Notes and lectures need to live inside a section or module")
        if src.is_dir() and (dest == src or src in dest.parents):
            raise VaultError("Can't move a folder inside itself")
        old_parent = src.parent
        if dest != old_parent:
            target = unique_path(dest, src.stem if src.is_file() else src.name, src.suffix if src.is_file() else "")
            shutil.move(str(src), str(target))
            _remove_order(old_parent, node_id)
            if target.is_dir() and skind in ("section", "module"):
                meta = read_meta(target)
                meta["kind"] = "section" if dkind == "root" else "module"
                write_meta(target, meta)
        _append_order(dest, node_id, index)
        title = read_meta(dest).get("title", "Knowledge")
        commit(f"Move '{_title(node_id, idx)}' to '{title}'")
        return {"id": node_id, "parent": _id_of(dest) or "root"}


def _title(node_id: str, idx: dict[str, Path]) -> str:
    p = idx[node_id]
    if p.is_file():
        return split_front_matter(p.read_text(errors="replace"))[0].get("title", p.stem)
    return read_meta(p).get("title", p.name)


def archive(node_id: str) -> None:
    with _lock():
        _, idx = scan()
        src = idx[node_id]
        if kind_of(src) in ("root", "inbox", "archive"):
            raise VaultError("This folder can't be archived")
        parent_id = _id_of(src.parent) or "root"
        dest = VAULT / ARCHIVE
        target = unique_path(dest, src.stem if src.is_file() else src.name, src.suffix if src.is_file() else "")
        if src.is_dir():
            meta = read_meta(src)
            meta["archived_from"], meta["archived_at"] = parent_id, now()
            write_meta(src, meta)
        else:
            fm, body = split_front_matter(src.read_text())
            fm["archived_from"], fm["archived_at"] = parent_id, now()
            src.write_text(join_front_matter(fm, body))
        title = _title(node_id, idx)
        shutil.move(str(src), str(target))
        _remove_order(src.parent, node_id)
        _append_order(dest, node_id, 0)
        commit(f"Archive '{title}'")


def restore(node_id: str) -> None:
    with _lock():
        _, idx = scan()
        src = idx[node_id]
        if src.parent != VAULT / ARCHIVE:
            raise VaultError("Only archived items can be restored")
        if src.is_dir():
            meta = read_meta(src)
            back = meta.pop("archived_from", "root")
            meta.pop("archived_at", None)
            write_meta(src, meta)
        else:
            fm, body = split_front_matter(src.read_text())
            back = fm.pop("archived_from", "inbox")
            fm.pop("archived_at", None)
            src.write_text(join_front_matter(fm, body))
        dest = VAULT if back == "root" else idx.get(back, VAULT / INBOX)
        if dest == VAULT and kind_of(src) in ("note", "lecture"):
            dest = VAULT / INBOX
        target = unique_path(dest, src.stem if src.is_file() else src.name, src.suffix if src.is_file() else "")
        shutil.move(str(src), str(target))
        _remove_order(VAULT / ARCHIVE, node_id)
        _append_order(dest, node_id)
        commit(f"Restore '{_title(node_id, idx)}'")


# ---------------------------------------------------------------- notes

def create_note(parent_id: str, title: str, body: str = "", author: str = "you", tags: list[str] | None = None) -> dict:
    with _lock():
        parent = VAULT / INBOX if parent_id in ("", "inbox") else resolve(parent_id)
        if kind_of(parent) not in ("inbox", "section", "module"):
            raise VaultError("Notes go inside a section, module or the Inbox")
        fm = {"id": new_id("n"), "title": title.strip() or "Untitled", "created": now(), "updated": now(),
              "author": author, "tags": tags or []}
        path = unique_path(parent, safe_name(fm["title"]), ".md")
        path.write_text(join_front_matter(fm, body))
        _append_order(parent, fm["id"])
        commit(f"{'AI adds' if author != 'you' else 'Add'} note '{fm['title']}'")
        return {**fm, "path": str(path.relative_to(VAULT))}


def read_note(node_id: str) -> dict:
    path = resolve(node_id)
    if not path.is_file():
        raise VaultError("Not a note")
    fm, body = split_front_matter(path.read_text(errors="replace"))
    return {**fm, "body": body, "path": str(path.relative_to(VAULT))}


def update_note(node_id: str, body: str, author: str = "you") -> dict:
    with _lock():
        path = resolve(node_id)
        fm, _ = split_front_matter(path.read_text(errors="replace"))
        if author != "you" and fm.get("author", "you") == "you":
            raise VaultError("AI assistants can't overwrite notes you wrote - add a new note instead")
        fm["updated"] = now()
        path.write_text(join_front_matter(fm, body))
        commit(f"Edit note '{fm.get('title', path.stem)}'")
        return {**fm, "body": body}


# ---------------------------------------------------------------- lectures

def create_lecture(parent_id: str, title: str, **meta_fields) -> tuple[dict, Path]:
    with _lock():
        parent = VAULT / INBOX if parent_id in ("", "inbox") else resolve(parent_id)
        if kind_of(parent) not in ("inbox", "section", "module"):
            raise VaultError("Lectures go inside a section, module or the Inbox")
        folder = unique_path(parent, safe_name(title))
        folder.mkdir()
        for part in LECTURE_PARTS:
            (folder / part).mkdir()
        meta = {"id": new_id("l"), "kind": "lecture", "title": title, "created": now(), "status": "new", **meta_fields}
        write_meta(folder, meta)
        (folder / "My Notes" / "notes.md").write_text(
            join_front_matter({"title": f"My notes - {title}", "author": "you", "created": now()}, ""))
        _append_order(parent, meta["id"])
        commit(f"Add lecture '{title}'")
        return meta, folder


def update_lecture_meta(lecture_id: str, message: str | None = None, **fields) -> dict:
    with _lock():
        folder = resolve(lecture_id)
        meta = read_meta(folder)
        meta.update(fields)
        write_meta(folder, meta)
        if message:
            commit(message)
        return meta


def write_generated(lecture_id: str, filename: str, content: str) -> Path:
    """AI-written study material. Only ever lands in Generated/."""
    with _lock():
        folder = resolve(lecture_id)
        if kind_of(folder) != "lecture":
            raise VaultError("Not a lecture")
        name = safe_name(Path(filename).name)
        if not name.endswith((".md", ".json")):
            name += ".md"
        path = folder / "Generated" / name
        path.write_text(content.rstrip() + "\n")
        commit(f"Generated '{name}' for '{read_meta(folder).get('title')}'")
        return path


def commit_now(message: str) -> None:
    with _lock():
        commit(message)


def lecture_files(lecture_id: str) -> dict:
    folder = resolve(lecture_id)
    out = {}
    for part in LECTURE_PARTS:
        d = folder / part
        out[part] = sorted(p.name for p in d.iterdir() if not p.name.startswith(".")) if d.exists() else []
    return out


def media_path(lecture_id: str, suffix: str = ".m4a") -> Path:
    return VAULT / MEDIA / f"{lecture_id}{suffix}"


def breadcrumbs(path: Path) -> list[dict]:
    crumbs = []
    p = path.parent if path.is_file() else path
    while p != VAULT and VAULT in p.parents:
        m = read_meta(p)
        crumbs.append({"id": m.get("id"), "title": m.get("title", p.name), "kind": m.get("kind")})
        p = p.parent
    return list(reversed(crumbs))
