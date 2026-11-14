"""Full-text search across the whole vault (SQLite FTS5).

The index lives outside the vault (it can always be rebuilt) and is refreshed
whenever the vault's git history moves on.
"""
from __future__ import annotations

import hashlib
import re
import json
import sqlite3
from pathlib import Path

from . import vault
from .lectures import fmt_time, panopto_link

CACHE = Path(__file__).resolve().parent.parent / "cache"
DB = CACHE / ("search.db" if vault.VAULT == Path.home() / "Knowledge"
               else f"search-{hashlib.sha1(str(vault.VAULT).encode()).hexdigest()[:8]}.db")


def strip_code(text: str) -> str:
    """Leave interactive widgets / chart JSON out of the search index."""
    return re.sub(r"```(?:widget|plotly)\n.*?```", " ", text, flags=re.S)


def _connect() -> sqlite3.Connection:
    CACHE.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT)")
    con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5("
                "node_id UNINDEXED, part UNINDEXED, title, place UNINDEXED, body, extra UNINDEXED,"
                "tokenize='porter unicode61 remove_diacritics 2')")
    return con


def _docs():
    tree, index = vault.scan()

    def place(path: Path) -> str:
        return " › ".join(c["title"] for c in vault.breadcrumbs(path))

    for node_id, path in index.items():
        if path.is_file():
            fm, body = vault.split_front_matter(path.read_text(errors="replace"))
            yield node_id, "note", fm.get("title", path.stem), place(path), body, {}
            continue
        meta = vault.read_meta(path)
        if meta.get("kind") != "lecture":
            if meta.get("description"):
                yield node_id, meta.get("kind"), meta.get("title"), place(path.parent), meta["description"], {}
            continue
        title, url = meta.get("title", path.name), meta.get("panopto_url", "")
        where = place(path)
        al = path / "Source" / "alignment.json"
        tj = path / "Source" / "transcript.json"
        if al.exists() and tj.exists():
            segs = {s["id"]: s for s in json.loads(tj.read_text())["segments"]}
            from .lectures import pdf_pages
            pages = {p["page"]: p for p in pdf_pages(path / "Source" / "slides.pdf")} if (path / "Source" / "slides.pdf").exists() else {}
            for c in json.loads(al.read_text())["chunks"]:
                said = " ".join(segs[i]["text"] for i in c["segments"] if i in segs)
                slide = pages.get(c["page"], {}).get("text", "") if c["page"] else ""
                yield (node_id, f"slide:{c['n']}", f"{title} — {c['title']}", where,
                       f"{slide}\n{said}", {"time": fmt_time(c["start"]), "link": panopto_link(url, c["start"]),
                                            "slide": c["page"], "chunk": c["n"]})
        for part in ("Generated", "My Notes"):
            for f in sorted((path / part).glob("*.md")):
                body = strip_code(vault.split_front_matter(f.read_text(errors="replace"))[1])
                yield node_id, f"{part}/{f.name}", f"{title} — {f.stem}", where, body, {}


def refresh(force: bool = False) -> None:
    head = vault._git("rev-parse", "HEAD", check=False).strip()
    con = _connect()
    row = con.execute("SELECT v FROM state WHERE k='head'").fetchone()
    if not force and row and row[0] == head:
        return
    con.execute("DELETE FROM docs")
    con.executemany("INSERT INTO docs VALUES (?,?,?,?,?,?)",
                    [(a, b, c, d, e, json.dumps(f)) for a, b, c, d, e, f in _docs()])
    con.execute("INSERT OR REPLACE INTO state VALUES ('head', ?)", (head,))
    con.commit()
    con.close()


def _fts_query(q: str) -> str:
    words = [w.replace('"', "") for w in q.split() if w.strip('"')]
    meaningful = [w for w in words if len(w) > 2] or words  # skip "of", "to"... unless that's all there is
    return " ".join(f'"{w}"*' for w in meaningful)


def search(q: str, limit: int = 20) -> list[dict]:
    if not q.strip():
        return []
    refresh()
    con = _connect()
    try:
        rows = con.execute(
            "SELECT node_id, part, title, place, snippet(docs, 4, '«', '»', ' … ', 24), extra, bm25(docs, 0, 0, 4.0, 0, 1.0) AS r "
            "FROM docs WHERE docs MATCH ? ORDER BY r LIMIT ?", (_fts_query(q), limit)).fetchall()
    except sqlite3.OperationalError:
        rows = []
    con.close()
    return [{"id": a, "part": b, "title": c, "place": d, "snippet": e, **json.loads(f)} for a, b, c, d, e, f, _ in rows]
