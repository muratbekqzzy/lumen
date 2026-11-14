"""The knowledge graph: how everything in the vault connects.

Nodes  - sections, modules, lectures, notes, and concepts.
Edges  - "contains" (the structure you built) and "mentions" ([[wikilinks]] written in notes,
         study packs and explanations, Obsidian-style). A concept mentioned in two different
         subjects becomes a bridge between them.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import vault

WIKILINK = re.compile(r"\[\[([A-Za-zÀ-ÿĀ-ſА-яء-ي][^\[\]|\n]{0,80}?)(?:\|([^\[\]\n]{1,80}))?\]\]")
FENCE = re.compile(r"(```.*?```|`[^`\n]*`)", re.S)


def concept_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower().replace("–", "-").replace("—", "-"))


def links_in(text: str) -> list[str]:
    """[[Concept]] / [[Concept|label]] outside code blocks."""
    out = []
    for i, part in enumerate(FENCE.split(text or "")):
        if i % 2 == 0:
            out += [m.group(1).strip() for m in WIKILINK.finditer(part)]
    return out


def replace_links(text: str, to_href) -> str:
    """Turn [[Concept|label]] into Markdown links, leaving code untouched."""
    parts = FENCE.split(text or "")
    for i in range(0, len(parts), 2):
        parts[i] = WIKILINK.sub(lambda m: f"[{(m.group(2) or m.group(1)).strip()}]({to_href(m.group(1).strip())})", parts[i])
    return "".join(parts)


def _texts_of(path: Path, kind: str) -> list[tuple[str, str]]:
    """(part, text) pairs that may contain links for one node."""
    if kind == "note":
        return [("note", vault.split_front_matter(path.read_text(errors="replace"))[1])]
    if kind == "lecture":
        out = []
        for sub in ("Generated", "My Notes"):
            for f in sorted((path / sub).glob("*.md")):
                out.append((f"{sub}/{f.name}", vault.split_front_matter(f.read_text(errors="replace"))[1]))
        return out
    desc = vault.read_meta(path).get("description", "")
    return [("description", desc)] if desc else []


def build() -> dict:
    tree, index = vault.scan()
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    by_title: dict[str, str] = {}

    def walk(n: dict, parent: str | None, section: str | None, color: str | None, archived=False):
        kind = n.get("kind")
        if kind == "archive":
            return
        sid = section
        col = color
        if kind == "section":
            sid, col = n["id"], n.get("color") or color
        if kind not in ("root", "inbox"):
            nodes[n["id"]] = {"id": n["id"], "kind": kind, "title": n.get("title", ""), "section": sid,
                              "color": col or "", "icon": n.get("icon", "")}
            by_title.setdefault(concept_key(n.get("title", "")), n["id"])
            if parent:
                edges.append({"source": parent, "target": n["id"], "type": "contains"})
        for c in n.get("children", []):
            walk(c, n["id"] if kind not in ("root", "inbox") else None, sid, col)

    walk(tree, None, None, None)
    walk(tree["inbox"], None, None, None)

    seen = set()
    for nid, node in list(nodes.items()):
        path = index.get(nid)
        if path is None:
            continue
        for _, text in _texts_of(path, node["kind"]):
            for name in links_in(text):
                key = concept_key(name)
                target = by_title.get(key)
                if target is None:
                    target = "c:" + key
                    if target not in nodes:
                        nodes[target] = {"id": target, "kind": "concept", "title": name, "section": None, "color": "", "icon": ""}
                if target != nid and (nid, target) not in seen:
                    seen.add((nid, target))
                    edges.append({"source": nid, "target": target, "type": "mentions"})

    degree: dict[str, int] = {}
    for e in edges:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    for n in nodes.values():
        n["degree"] = degree.get(n["id"], 0)
    # concepts shared by more than one section are bridges between subjects
    for n in nodes.values():
        if n["kind"] == "concept":
            secs = {nodes[e["source"]]["section"] for e in edges if e["target"] == n["id"] and e["source"] in nodes}
            n["bridges"] = len(secs - {None})
    return {"nodes": list(nodes.values()), "edges": edges}


def concept(name: str) -> dict:
    """Everything that mentions a concept, with a snippet around each mention."""
    key = concept_key(name)
    _, index = vault.scan()
    hits = []
    for nid, path in index.items():
        kind = "note" if path.is_file() else vault.read_meta(path).get("kind")
        if kind not in ("note", "lecture", "section", "module"):
            continue
        for part, text in _texts_of(path, kind):
            plain = FENCE.sub(" ", text)
            for m in WIKILINK.finditer(plain):
                if concept_key(m.group(1)) == key:
                    # prefer the first place the idea is used in running text, not a list of links
                    flat = WIKILINK.sub(lambda x: (x.group(2) or x.group(1)), plain)
                    flat = re.sub(r"\n#+ Key concepts\n.*", "", flat, flags=re.S)
                    hit = re.search(re.escape(m.group(2) or m.group(1)), flat, re.I)
                    title = (vault.split_front_matter(path.read_text(errors="replace"))[0].get("title", path.stem)
                             if path.is_file() else vault.read_meta(path).get("title"))
                    place = " › ".join(c["title"] for c in vault.breadcrumbs(path)[:-1])
                    if not hit:
                        hits.append({"id": nid, "kind": kind, "title": title, "part": part, "place": place,
                                     "snippet": "_Listed among this item's key concepts._"})
                        break
                    a, b = max(0, hit.start() - 160), min(len(flat), hit.end() + 200)
                    snippet = re.sub(r"\s+", " ", flat[a:b])
                    snippet = re.sub(r"(^|\s)(#{1,6}|>)\s", " ", snippet).strip()
                    if a:  # start on a word boundary
                        snippet = snippet.split(" ", 1)[-1]
                    hits.append({"id": nid, "kind": kind, "title": title, "part": part, "place": place,
                                 "snippet": ("…" if a else "") + snippet.strip() + ("…" if b < len(flat) else "")})
                    break
    return {"name": name, "mentions": hits}
