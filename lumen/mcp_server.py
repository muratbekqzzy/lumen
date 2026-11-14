"""Lumen connector (MCP): lets any AI assistant read and add to your knowledge vault.

Run locally for Claude Desktop / Claude Code (stdio):   python -m lumen.mcp_server
Run over HTTP (for ChatGPT via a secure tunnel):        python -m lumen.mcp_server --http

Rules enforced here, not just requested:
  * Assistants can NOT create, rename, move, reorder or archive sections/modules. Structure is yours.
  * Assistants can NOT edit lecture sources or your own notes. They write only to a lecture's
    Generated/ folder or add new notes marked as written by an assistant.
  * Every write is a versioned git commit, so anything can be undone.
"""
from __future__ import annotations

import json
import re
import sys

from mcp.server.mcpserver import MCPServer

from . import graph, lectures, search as fts, vault
from .search import strip_code

INSTRUCTIONS = """Lumen is the user's personal, lifelong knowledge vault for university and self-study
(sections such as languages, psychology, filmmaking, each holding modules, lectures and notes).

How to help well:
- Ground answers in the vault. Use `search` and `get_lecture` before answering questions about what
  the user was taught, and cite the lecture, slide number and timestamp (with the Panopto link if given).
- Keep what the lecturer said separate from outside knowledge. Mark outside material clearly.
- The user organises the vault themselves. Never suggest you created or moved sections/modules.
  If you don't know where something belongs, use `add_note` without `place_id` (it goes to the Inbox).
- When asked to make study material for a lecture, read it with get_lecture(include="everything") first,
  then save with `save_study_material`.

Formatting for anything you save (Markdown):
- Maths: $inline$ and $$display$$ (KaTeX).
- Interactive 2D/3D charts: a fenced code block with language `plotly` containing Plotly JSON
  {"data": [...], "layout": {...}, "caption": "..."}.
- Interactive explainers: a fenced code block with language `widget` containing a self-contained HTML
  snippet with inline <script> (sliders, draggable points, simulations). Optional first line
  `<!-- height: 520 -->`. It runs sandboxed; no network access. CSS variables --ink, --muted, --accent,
  --line, --panel, --mark are provided so it matches the app's light/dark theme.
- "Check my understanding" quizzes: a fenced code block with language `quiz` containing JSON
  {"title": "...", "questions": [{"q": "...", "options": ["...", "..."], "answer": 0, "why": "..."}]}.
- Explain like a patient tutor: logic first, then the maths; short sections, bold one-line takeaways,
  a worked example, then a quiz.

Connecting knowledge (this builds the user's knowledge graph):
- Mark key ideas as Obsidian-style concept links: [[Treatment effect]], [[F ratio]]. Use the SAME
  names that already exist - call `list_concepts` first and reuse them; only invent new ones for
  genuinely new ideas. Prefer singular, Title-case names. End study material with a
  "## Key concepts" line listing the [[links]]. Never put [[...]] inside table cells with a | alias.
"""

mcp = MCPServer("Lumen", title="Lumen knowledge vault", instructions=INSTRUCTIONS, log_level="WARNING")


def _outline(node: dict, depth: int = 0) -> list[str]:
    lines = []
    for c in node.get("children", []):
        k = c["kind"]
        extra = ""
        if k == "lecture":
            extra = f" [{c.get('status', '')}{', ' + c['lecturer'] if c.get('lecturer') else ''}]"
        lines.append(f"{'  ' * depth}- {k}: {c['title']} (id: {c['id']}){extra}")
        if k in ("section", "module"):
            lines += _outline(c, depth + 1)
    return lines


@mcp.tool()
def list_library() -> str:
    """Show the whole vault: sections, modules, lectures and notes, with their ids."""
    tree, _ = vault.scan()
    out = ["# Lumen library", ""]
    out += _outline(tree) or ["(no sections yet - the user creates these themselves)"]
    inbox = _outline(tree["inbox"])
    out += ["", "## Inbox (not yet filed)"] + (inbox or ["(empty)"])
    return "\n".join(out)


@mcp.tool()
def search(query: str, limit: int = 10) -> str:
    """Full-text search across every lecture transcript, slide, study pack and note.
    Results include where each hit lives, and for lectures the slide number, time and a Panopto link."""
    rs = fts.search(query, limit)
    if not rs:
        return "No results."
    out = []
    for r in rs:
        loc = f"{r['place']} > " if r.get("place") else ""
        where = f" | slide {r['slide']} at {r['time']} {r.get('link', '')}" if r.get("time") else ""
        out.append(f"- {loc}{r['title']} (id: {r['id']}, part: {r['part']}){where}\n  …{r['snippet'].replace('«', '**').replace('»', '**')}…")
    return "\n".join(out)


@mcp.tool()
def get_lecture(lecture_id: str, include: str = "overview") -> str:
    """Read a lecture. include = "overview" (slide list, what exists), "transcript", "study_pack",
    "notes" (the user's own notes) or "everything" (slides + what was said on each + lecturer's slide
    notes + all study material). Use "everything" before generating study material."""
    b = lectures.lecture_bundle(lecture_id)
    m = b["meta"]
    place = " > ".join(c["title"] for c in b["breadcrumbs"][:-1]) or "Inbox"
    head = [f"# {m['title']}", f"Place: {place}", f"Lecturer: {m.get('lecturer', '-')} | Date: {m.get('date', '-')} | "
            f"Course: {m.get('course', '-')} | Length: {round((m.get('duration') or 0) / 60)} min | Status: {m.get('status')}",
            f"Panopto: {m.get('panopto_url') or '-'}", f"Study material saved: {', '.join(b['generated']) or 'none yet'}", ""]
    if include == "overview":
        head.append("## Slides in the order shown")
        head += [f"- {c['time']} " + (f"slide {c['page']}: " if c["page"] else "(not in PDF) ") + c["title"] for c in b["chunks"]]
        return "\n".join(head)
    if include == "study_pack":
        return "\n".join(head) + "\n" + "\n\n".join(f"## {k}\n{strip_code(v)}" for k, v in b["generated"].items())
    if include == "notes":
        return "\n".join(head) + "\n## The user's own notes\n" + (b["my_notes"] or "(empty)")
    parts = []
    for c in b["chunks"]:
        said = " ".join(s["text"] for s in c["said"])
        label = f"Slide {c['page']}" if c["page"] else "Slide not in the PDF"
        block = [f"## [{c['time']}] {label}: {c['title']}"]
        if c["link"]:
            block.append(f"Panopto: {c['link']}")
        if include == "everything" and c["slide_text"]:
            block.append(f"Slide text:\n{c['slide_text']}")
        if include == "everything" and c.get("notes"):
            notes = re.sub(r"\s+", " ", c["notes"])[:1500]
            block.append(f"Lecturer's slide notes: {notes}")
        block.append(f"Said: {said or '(no speech)'}")
        parts.append("\n".join(block))
    text = "\n".join(head) + "\n" + "\n\n".join(parts)
    if include == "everything":
        if b["pages_not_shown"]:
            extra = [p for p in b["pages"] if p["page"] in b["pages_not_shown"]]
            text += "\n\n# PDF slides not shown in the recording\n" + "\n\n".join(f"## Slide {p['page']}\n{p['text']}" for p in extra)
        if b["generated"]:
            text += "\n\n# Study material already saved\n" + "\n\n".join(f"## {k}\n{strip_code(v)}" for k, v in b["generated"].items())
        if b["my_notes"].strip():
            text += "\n\n# The user's own notes\n" + b["my_notes"]
    return text


@mcp.tool()
def get_slide(lecture_id: str, slide: int) -> str:
    """One slide of a lecture (PDF page number): its text, exactly what was said, the time and a Panopto link."""
    b = lectures.lecture_bundle(lecture_id)
    hits = [c for c in b["chunks"] if c["page"] == slide]
    if not hits:
        page = next((p for p in b["pages"] if p["page"] == slide), None)
        if not page:
            return f"No slide {slide} in this lecture."
        return f"Slide {slide} (not shown in the recording):\n{page['text']}"
    out = []
    for c in hits:
        out.append(f"## Slide {slide}: {c['title']} at {c['time']} ({c['link'] or 'no link'})\n"
                   f"Slide text:\n{c['slide_text']}\n\nSaid:\n" + " ".join(s["text"] for s in c["said"]))
    return "\n\n".join(out)


@mcp.tool()
def list_concepts() -> str:
    """Every concept ([[link]]) already in the vault, with how many places mention it.
    Reuse these exact names when writing so new material connects to existing knowledge."""
    g = graph.build()
    cs = sorted((n for n in g["nodes"] if n["kind"] == "concept"), key=lambda n: (-n["degree"], n["title"].lower()))
    if not cs:
        return "No concepts yet."
    return "\n".join(f"- {n['title']} ({n['degree']} mention{'s' if n['degree'] != 1 else ''}"
                     f"{', bridges ' + str(n['bridges']) + ' sections' if n.get('bridges', 0) > 1 else ''})" for n in cs)


@mcp.tool()
def read_note(note_id: str) -> str:
    """Read a note by id."""
    n = vault.read_note(note_id)
    return f"# {n.get('title')}\n(author: {n.get('author', 'you')}, updated {n.get('updated')})\n\n{n['body']}"


@mcp.tool()
def save_study_material(lecture_id: str, kind: str, content: str) -> str:
    """Save AI-made study material for a lecture. kind = "study-pack", "flashcards" or "resources".
    - study-pack: structured notes (key ideas, definitions, worked examples, studies and people
      mentioned, likely exam points, common confusions). Cite slides/timestamps.
    - flashcards: one card per pair of lines `Q: ...` then `A: ...`.
    - resources: further reading, ALWAYS clearly separated from what was taught, with sources.
    Overwrites the previous version of that file (older versions stay in history)."""
    kinds = {"study-pack": "study-pack.md", "flashcards": "flashcards.md", "resources": "resources.md"}
    if kind not in kinds:
        return f"kind must be one of {', '.join(kinds)}"
    p = vault.write_generated(lecture_id, kinds[kind], content)
    if kind == "study-pack":
        vault.update_lecture_meta(lecture_id, "Study pack ready", status="complete")
    return f"Saved to {p.relative_to(vault.VAULT)}. It now appears in the lecture's '{kind}' tab in Lumen."


@mcp.tool()
def save_explanation(lecture_id: str, title: str, content: str, assistant: str = "AI assistant") -> str:
    """Save an explanation (e.g. a simple re-explanation of a hard idea, with interactive charts or
    widgets) to a lecture's Explanations tab. `assistant` = who wrote it, e.g. "ChatGPT" or "Claude"."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or "explanation"
    body = f"## {title}\n\n_Explained by {assistant} · {vault.now()[:10]}_\n\n{content}"
    p = vault.write_generated(lecture_id, f"explain-{slug}.md", body)
    return f"Saved to {p.relative_to(vault.VAULT)} (Explanations tab)."


@mcp.tool()
def add_note(title: str, content: str, place_id: str = "inbox", assistant: str = "AI assistant") -> str:
    """Add a new note. place_id must be an existing section or module id (see list_library), or omit it
    to put the note in the Inbox for the user to file. Notes are marked as written by `assistant`."""
    n = vault.create_note(place_id or "inbox", title, content, author=assistant)
    return f"Added note '{n['title']}' (id: {n['id']}) at {n['path']}."


def main():
    vault.init()
    if "--http" in sys.argv:
        mcp.run(transport="streamable-http", host="127.0.0.1", port=4322)
    else:
        mcp.run()


if __name__ == "__main__":
    main()
