"""Lumen web app: a local server for the knowledge vault (http://localhost:4321)."""
from __future__ import annotations

import json
import shutil
import tempfile
import threading
import traceback
from pathlib import Path

import pymupdf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from markdown_it import MarkdownIt
from pydantic import BaseModel

from . import graph, lectures, search, vault

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False}).enable(["table", "strikethrough"])

app = FastAPI(title="Lumen")
JOBS: dict[str, dict] = {}
TRANSCRIPTION_LOCK = threading.Lock()


@app.middleware("http")
async def revalidate_static(request, call_next):
    """Browsers re-check app files on every load, so updates show up immediately (ETags keep it fast)."""
    resp = await call_next(request)
    if not request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.exception_handler(vault.VaultError)
async def vault_error(_, exc: vault.VaultError):
    return JSONResponse({"error": str(exc)}, status_code=400)


def render(text: str) -> str:
    from urllib.parse import quote
    return md.render(graph.replace_links(text or "", lambda name: f"#/concept/{quote(name)}"))


# ---------------------------------------------------------------- structure

class NewContainer(BaseModel):
    parent_id: str = "root"
    title: str
    icon: str = ""
    color: str = ""
    type: str = ""


class Patch(BaseModel):
    icon: str | None = None
    color: str | None = None
    type: str | None = None
    description: str | None = None


class Rename(BaseModel):
    id: str
    title: str


class Reorder(BaseModel):
    parent_id: str
    ids: list[str]


class Move(BaseModel):
    id: str
    parent_id: str
    index: int | None = None


class Ident(BaseModel):
    id: str


class NewNote(BaseModel):
    parent_id: str = "inbox"
    title: str
    body: str = ""


class Body(BaseModel):
    body: str


@app.get("/api/tree")
def tree():
    vault.commit_now("Changes made outside Lumen")  # no-op unless files changed in Finder etc.
    t, _ = vault.scan()
    return t


@app.post("/api/containers")
def create_container(p: NewContainer):
    return vault.create_container(p.parent_id, p.title, p.icon, p.color, p.type)


@app.patch("/api/containers/{node_id}")
def patch_container(node_id: str, p: Patch):
    return vault.update_container(node_id, **p.model_dump())


@app.post("/api/rename")
def rename(p: Rename):
    return vault.rename(p.id, p.title)


@app.post("/api/reorder")
def reorder(p: Reorder):
    vault.reorder(p.parent_id, p.ids)
    return {"ok": True}


@app.post("/api/move")
def move(p: Move):
    return vault.move(p.id, p.parent_id, p.index)


@app.post("/api/archive")
def archive(p: Ident):
    vault.archive(p.id)
    return {"ok": True}


@app.post("/api/restore")
def restore(p: Ident):
    vault.restore(p.id)
    return {"ok": True}


@app.get("/api/history")
def history():
    return vault.history(50)


@app.post("/api/undo")
def undo():
    return {"undone": vault.undo_last()}


@app.get("/api/node/{node_id}")
def node(node_id: str):
    path = vault.resolve(node_id)
    meta = vault.read_meta(path) if path.is_dir() else {}
    if meta.get("description"):
        meta["description_html"] = render(meta["description"])
    return {**meta, "breadcrumbs": vault.breadcrumbs(path)}


# ---------------------------------------------------------------- notes

@app.post("/api/notes")
def new_note(p: NewNote):
    return vault.create_note(p.parent_id, p.title, p.body)


@app.get("/api/notes/{node_id}")
def get_note(node_id: str):
    n = vault.read_note(node_id)
    path = vault.resolve(node_id)
    return {**n, "html": render(n["body"]), "breadcrumbs": vault.breadcrumbs(path)}


@app.put("/api/notes/{node_id}")
def put_note(node_id: str, p: Body):
    n = vault.update_note(node_id, p.body)
    return {**n, "html": render(p.body)}


# ---------------------------------------------------------------- lectures

@app.get("/api/lectures/{lecture_id}")
def get_lecture(lecture_id: str):
    b = lectures.lecture_bundle(lecture_id)
    b["generated_html"] = {k: render(v) for k, v in b["generated"].items() if k.endswith(".md")}
    b["my_notes_html"] = render(b["my_notes"])
    b["has_audio"] = bool(b["meta"].get("media")) and (vault.VAULT / vault.MEDIA / b["meta"]["media"]).exists()
    return b


@app.put("/api/lectures/{lecture_id}/notes")
def put_lecture_notes(lecture_id: str, p: Body):
    lectures.save_my_notes(lecture_id, p.body)
    return {"html": render(p.body)}


@app.get("/api/lectures/{lecture_id}/slides/{page}.png")
def slide_image(lecture_id: str, page: int):
    folder = vault.resolve(lecture_id)
    pdf = folder / "Source" / "slides.pdf"
    if not pdf.exists():
        raise HTTPException(404)
    out = CACHE / "slides" / lecture_id / f"{page}.png"
    if not out.exists() or out.stat().st_mtime < pdf.stat().st_mtime:
        out.parent.mkdir(parents=True, exist_ok=True)
        doc = pymupdf.open(pdf)
        if not 1 <= page <= doc.page_count:
            raise HTTPException(404)
        doc[page - 1].get_pixmap(dpi=110).save(out)
    return FileResponse(out, headers={"Cache-Control": "max-age=86400"})


@app.get("/api/lectures/{lecture_id}/audio")
def lecture_audio(lecture_id: str):
    meta = vault.read_meta(vault.resolve(lecture_id))
    f = vault.VAULT / vault.MEDIA / meta.get("media", "")
    if not meta.get("media") or not f.exists():
        raise HTTPException(404)
    return FileResponse(f, media_type="audio/mp4")


@app.post("/api/lectures")
async def add_lecture(parent_id: str = Form("inbox"), title: str = Form(...), panopto_url: str = Form(""),
                      lecturer: str = Form(""), date: str = Form(""), language: str = Form(""),
                      audio: UploadFile = File(...), slides: UploadFile | None = File(None)):
    tmp = Path(tempfile.mkdtemp(prefix="lumen-"))
    a = tmp / ("recording" + Path(audio.filename or "a.m4a").suffix)
    with a.open("wb") as fh:
        shutil.copyfileobj(audio.file, fh)
    s = None
    if slides and slides.filename:
        s = tmp / "slides.pdf"
        with s.open("wb") as fh:
            shutil.copyfileobj(slides.file, fh)
    meta, _ = vault.create_lecture(parent_id, title, panopto_url=panopto_url, lecturer=lecturer, date=date,
                                   status="queued")
    lid = meta["id"]
    JOBS[lid] = {"status": "queued", "log": []}

    def run():
        try:
            with TRANSCRIPTION_LOCK:
                JOBS[lid]["status"] = "running"
                lectures.ingest(parent_id, title, slides=s, audio=a, panopto_url=panopto_url, lecture_id=lid, language=language or None,
                                log=lambda m: JOBS[lid]["log"].append(m))
            JOBS[lid]["status"] = "done"
        except Exception as e:  # keep the error visible in the app
            JOBS[lid].update(status="error", error=str(e), trace=traceback.format_exc())
            vault.update_lecture_meta(lid, None, status="error", error=str(e))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    threading.Thread(target=run, daemon=True).start()
    return {"id": lid}


@app.get("/api/jobs")
def jobs():
    return JOBS


# ---------------------------------------------------------------- graph

@app.get("/api/graph")
def get_graph():
    return graph.build()


@app.get("/api/concept/{name}")
def get_concept(name: str):
    c = graph.concept(name)
    for m in c["mentions"]:
        m["snippet_html"] = render(m["snippet"])
    return c


# ---------------------------------------------------------------- search

@app.get("/api/search")
def do_search(q: str):
    return search.search(q, 30)


@app.get("/api/render")
def render_preview(text: str):
    return Response(render(text), media_type="text/html")


@app.post("/api/render")
def render_post(p: Body):
    return Response(render(p.body), media_type="text/html")


app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")


def main():
    import uvicorn
    vault.init()
    import os
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("LUMEN_PORT", 4321)), log_level="warning")


if __name__ == "__main__":
    main()
