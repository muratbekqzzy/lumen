"""Lecture pipeline: recording + slides + Panopto slide timings -> one connected package.

    ingest()  -> creates the lecture, stores originals, transcribes, aligns
    align()   -> matches what was said to each slide using Panopto's slide-change times
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from pathlib import Path

import pymupdf

from . import vault

STOP = set("the and for with that this are was you your from have has not but can all any its into than then there their they what when where which who will would been were our out use one two may also more most such each other".split())


def tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 2 and w not in STOP}


def fmt_time(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60}:{sec % 60:02d}"


def panopto_link(url: str, seconds: float) -> str:
    if not url:
        return ""
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return ""
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if key != "start"]
    query.append(("start", str(max(0, int(seconds)))))
    return urlunsplit(parsed._replace(query=urlencode(query)))


# ---------------------------------------------------------------- slides

def pdf_pages(pdf: Path) -> list[dict]:
    doc = pymupdf.open(pdf)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        lines = [l.strip() for l in text.splitlines() if l.strip() and not l.strip().isdigit()]
        pages.append({"page": i + 1, "title": lines[0] if lines else f"Slide {i + 1}", "text": "\n".join(lines)})
    return pages


def slides_markdown(pages: list[dict], title: str) -> str:
    out = [f"# Slides - {title}\n"]
    for p in pages:
        out.append(f"## Slide {p['page']}: {p['title']}\n\n{p['text']}\n")
    return "\n".join(out)


# ---------------------------------------------------------------- alignment

def _match(caption: str, pages: list[dict], current: int | None, data: str = "") -> tuple[int | None, float]:
    """Score each PDF page against a Panopto slide event (its title + the slide text Panopto stored)."""
    cap = tokens(caption)
    if not cap:
        return None, 0.0
    shown = tokens(data) | cap
    best, best_score = None, 0.0
    for p in pages:
        pt, tt = tokens(p["text"]), tokens(p["title"])
        cap_cov = len(cap & pt) / len(cap)            # caption words found on the page
        page_cov = len(pt & shown) / len(pt) if pt else 0  # page words found in what was shown
        score = (0.4 * cap_cov + 0.6 * page_cov) if data else cap_cov
        if tt and cap <= tt | tokens(p["text"].split("\n")[1] if "\n" in p["text"] else ""):
            score += 0.2                               # caption is (part of) this slide's title
        if tt == cap:
            score += 0.2
        if current is not None:  # lectures move forward: prefer the next pages
            gap = p["page"] - current
            score += 0.15 if 0 <= gap <= 2 else (0.05 if 0 < gap <= 6 else 0)
        if score > best_score:
            best, best_score = p["page"], score
    return best, best_score


def align(events: list, pages: list[dict], segments: list[dict], duration: float) -> tuple[list[dict], list[int]]:
    """events: [[seconds, caption, notes], ...] from Panopto. Returns slide-by-slide chunks."""
    chunks: list[dict] = []
    current_page = None
    for t, caption, notes in sorted(events, key=lambda e: e[0]):
        caption = (caption or "").strip()
        if not caption or caption.replace(".", "").isdigit() or len(tokens(caption)) == 0:
            continue  # an animation step on the same slide
        page, score = _match(caption, pages, current_page, notes or "")
        if page is not None and score >= 0.62:
            if chunks and chunks[-1]["page"] == page:
                continue
            title = next(p["title"] for p in pages if p["page"] == page)
            chunks.append({"page": page, "title": title, "start": t, "notes": notes or ""})
            current_page = page
        elif len(caption) < 80 and (not chunks or chunks[-1]["title"] != caption):
            # a slide shown in the lecture that isn't in your PDF
            chunks.append({"page": None, "title": caption, "start": t, "notes": notes or ""})
    if not chunks or chunks[0]["start"] > 1:
        chunks.insert(0, {"page": None, "title": "Introduction", "start": 0.0, "notes": ""})
    for i, c in enumerate(chunks):
        c["n"] = i + 1
        c["end"] = chunks[i + 1]["start"] if i + 1 < len(chunks) else duration
        mid = lambda s: (s["start"] + s["end"]) / 2
        c["segments"] = [s["id"] for s in segments if c["start"] <= mid(s) < c["end"]]
    shown = {c["page"] for c in chunks if c["page"]}
    for c in chunks:
        c["not_in_pdf"] = c["page"] is None and c["title"] != "Introduction"
    return chunks, sorted(set(p["page"] for p in pages) - shown)


def transcript_markdown(title: str, chunks: list[dict], segments: list[dict], url: str) -> str:
    by_id = {s["id"]: s for s in segments}
    out = [f"# Transcript - {title}\n", "_Transcribed locally with Whisper. Grouped by the slide on screen._\n"]
    for c in chunks:
        label = f"Slide {c['page']}" if c["page"] else "Slide not in PDF"
        link = panopto_link(url, c["start"])
        stamp = f"[{fmt_time(c['start'])}]({link})" if link else f"[{fmt_time(c['start'])}]"
        out.append(f"## {stamp} {label} - {c['title']}\n")
        text = " ".join(by_id[i]["text"] for i in c["segments"] if i in by_id)
        out.append((text or "_(no speech)_") + "\n")
    return "\n".join(out)


# ---------------------------------------------------------------- pipeline

def ingest(parent_id: str, title: str, *, slides: Path | None, audio: Path, panopto_url: str = "",
           panopto_meta: dict | None = None, vocabulary: str = "", lecturer: str = "", date: str = "",
           course: str = "", lecture_id: str | None = None, language: str | None = None, log=print) -> str:
    if lecture_id is None:
        meta, folder = vault.create_lecture(parent_id, title, panopto_url=panopto_url, lecturer=lecturer,
                                            date=date, course=course, status="processing")
        lecture_id = meta["id"]
    else:
        folder = vault.resolve(lecture_id)
    src = folder / "Source"

    pages: list[dict] = []
    if slides:
        shutil.copy2(slides, src / "slides.pdf")
        pages = pdf_pages(src / "slides.pdf")
        (src / "slides.md").write_text(slides_markdown(pages, title))
        if not vocabulary:
            vocabulary = ", ".join(dict.fromkeys(p["title"] for p in pages))[:600]
    if panopto_meta:
        (src / "panopto.json").write_text(json.dumps(panopto_meta, indent=1, ensure_ascii=False))
    media = vault.media_path(lecture_id, audio.suffix or ".m4a")
    if audio.resolve() != media.resolve():
        shutil.copy2(audio, media)
    vault.update_lecture_meta(lecture_id, f"Store sources for '{title}'", status="transcribing",
                              media=media.name, slide_count=len(pages))

    log("Transcribing with Whisper (on this Mac)...")
    from .transcribe import transcribe
    data = transcribe(media, src / "transcript.json", vocabulary, language=language)
    segments = data["segments"]
    duration = segments[-1]["end"] if segments else 0
    if panopto_meta and panopto_meta.get("dur"):
        duration = max(duration, float(panopto_meta["dur"]))

    log("Lining up speech with slides...")
    events = (panopto_meta or {}).get("slides", [])
    chunks, unshown = align(events, pages, segments, duration) if events else (
        [{"n": 1, "page": None, "title": "Whole lecture", "start": 0, "end": duration, "notes": "",
          "segments": [s["id"] for s in segments], "not_in_pdf": False}], [])
    (src / "alignment.json").write_text(json.dumps({"chunks": chunks, "pages_not_shown": unshown}, indent=1, ensure_ascii=False))
    (src / "transcript.md").write_text(transcript_markdown(title, chunks, segments, panopto_url))
    vault.update_lecture_meta(lecture_id, f"Transcribed '{title}'", status="transcribed",
                              duration=round(duration), segments=len(segments))
    log(f"Done: {len(segments)} transcript segments across {len(chunks)} slides.")
    return lecture_id


def realign(lecture_id: str) -> None:
    folder = vault.resolve(lecture_id)
    src, meta = folder / "Source", vault.read_meta(folder)
    pages = pdf_pages(src / "slides.pdf") if (src / "slides.pdf").exists() else []
    pm = json.loads((src / "panopto.json").read_text()) if (src / "panopto.json").exists() else {}
    segs = json.loads((src / "transcript.json").read_text())["segments"]
    duration = max([float(meta.get("duration") or 0), *(float(s["end"]) for s in segs)])
    if pm.get("slides"):
        chunks, unshown = align(pm["slides"], pages, segs, duration)
    else:
        chunks, unshown = ([{"n": 1, "page": None, "title": "Whole lecture", "start": 0,
                            "end": duration, "notes": "", "segments": [s["id"] for s in segs],
                            "not_in_pdf": False}], [])
    (src / "alignment.json").write_text(json.dumps({"chunks": chunks, "pages_not_shown": unshown}, indent=1, ensure_ascii=False))
    (src / "transcript.md").write_text(transcript_markdown(meta["title"], chunks, segs, meta.get("panopto_url", "")))
    vault.commit_now(f"Re-align '{meta['title']}'")


def lecture_bundle(lecture_id: str) -> dict:
    """Everything about a lecture, for the app and for AI assistants."""
    folder = vault.resolve(lecture_id)
    meta = vault.read_meta(folder)
    src = folder / "Source"
    segs = json.loads((src / "transcript.json").read_text())["segments"] if (src / "transcript.json").exists() else []
    al = json.loads((src / "alignment.json").read_text()) if (src / "alignment.json").exists() else {"chunks": [], "pages_not_shown": []}
    pages = {p["page"]: p for p in pdf_pages(src / "slides.pdf")} if (src / "slides.pdf").exists() else {}
    by_id = {s["id"]: s for s in segs}
    url = meta.get("panopto_url", "")
    chunks = []
    for c in al["chunks"]:
        chunks.append({**c, "slide_text": pages.get(c["page"], {}).get("text", "") if c["page"] else "",
                       "said": [by_id[i] for i in c["segments"] if i in by_id],
                       "link": panopto_link(url, c["start"]), "time": fmt_time(c["start"])})
    generated = {}
    for p in sorted((folder / "Generated").glob("*")):
        if p.is_file() and not p.name.startswith("."):
            generated[p.name] = p.read_text(errors="replace")
    notes_path = folder / "My Notes" / "notes.md"
    my_notes = vault.split_front_matter(notes_path.read_text())[1] if notes_path.exists() else ""
    return {"meta": meta, "chunks": chunks, "pages_not_shown": al.get("pages_not_shown", []),
            "page_count": len(pages), "pages": list(pages.values()), "generated": generated, "my_notes": my_notes,
            "breadcrumbs": vault.breadcrumbs(folder)}


def save_my_notes(lecture_id: str, body: str) -> None:
    folder = vault.resolve(lecture_id)
    p = folder / "My Notes" / "notes.md"
    fm, _ = vault.split_front_matter(p.read_text()) if p.exists() else ({"title": "My notes", "author": "you"}, "")
    fm["updated"] = vault.now()
    p.write_text(vault.join_front_matter(fm, body))
    vault.commit_now(f"Edit my notes for '{vault.read_meta(folder).get('title')}'")


if __name__ == "__main__":
    # python -m lumen.lectures ingest PARENT_ID "Title" AUDIO [SLIDES.pdf] [panopto.json]
    _, cmd, parent, title, audio, *rest = sys.argv
    pm = json.loads(Path(rest[1]).read_text()) if len(rest) > 1 else None
    vault.init()
    lid = ingest(parent, title, slides=Path(rest[0]) if rest else None, audio=Path(audio),
                 panopto_url=(pm or {}).get("viewer_url", ""), panopto_meta=pm,
                 lecturer=(pm or {}).get("owner", ""), course=(pm or {}).get("folder", ""),
                 date=(pm or {}).get("date", ""))
    print("lecture id:", lid)
