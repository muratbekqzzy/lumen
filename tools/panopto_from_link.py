#!/usr/bin/env python3
"""Import Panopto's existing subtitles directly from a lecture URL on the user's Mac.

Usage:
  uv run python tools/panopto_from_link.py 'https://school.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=...' --browser chrome --slides slides.pdf

Requires a browser logged into Panopto and the 'uvx' command. This helper never
uploads cookies or captions; it prepares a JSON file for import into Lumen web.
The GitHub sync happens in Lumen after you import that file and unlock sync.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

def duration(s):
    a = [float(x.replace(",", ".")) for x in s.split(":")]
    n = 0.0
    for v in a:
        n = n * 60 + v
    return round(n, 2)

def parse_captions(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    segments = []
    pattern = re.compile(r"((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})")
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        m = pattern.search(lines[i])
        if not m:
            i += 1
            continue
        a, b = duration(m.group(1)), duration(m.group(2))
        i += 1
        block = []
        while i < len(lines) and lines[i].strip():
            block.append(lines[i].strip())
            i += 1
        words = re.sub(r"<[^>]*>", "", " ".join(block)).strip()
        if words and b >= a:
            prev = segments[-1] if segments else None
            if prev and prev["text"] == words and a <= prev["end"] + 0.25:
                prev["end"] = max(prev["end"], b)
            else:
                segments.append({"id": len(segments), "start": a, "end": b, "text": words})
    return segments

def get_pages(path):
    if not path:
        return []
    import pymupdf
    doc = pymupdf.open(path)
    if len(doc) > 300:
        raise ValueError("PDF exceeds the 300-slide limit")
    result = []
    for i, page in enumerate(doc, 1):
        raw = page.get_text()
        lines = [v.strip() for v in raw.splitlines() if v.strip()]
        result.append({"page": i, "title": next((v for v in lines if len(v)>3), f"Slide {i}"), "text": raw.strip()[:12000]})
    return result

def build(title, url, segments, pages, source):
    end = max(1, segments[-1]["end"])
    # No Panopto slide-change events are available from the captions extractor,
    # so proportional groupings are only approximations, not observed timings.
    chunks = []
    if pages:
        for i, page in enumerate(pages):
            a, b = end*i/len(pages), end*(i+1)/len(pages)
            chunks.append({"n":i+1,"page":page["page"],"title":page["title"],"start":a,"end":b,
                           "segmentIds":[s["id"] for s in segments if a <= (s["start"]+s["end"])/2 < b],
                           "slide_text":page["text"],"approximate":True})
    else:
        chunks = [{"n":1,"page":None,"title":"Transcript","start":0,"end":end,
                   "segmentIds":[s["id"] for s in segments],"slide_text":""}]
    out = [f"# {title}","", "_Structured from Panopto's caption track. Review for errors._","",
           "_Slide boundaries are estimates, not Panopto slide-change timestamps._",""]
    cards = ["# Flashcards","","_Questions from slide headings. Verify against your lecture._",""]
    for c in chunks:
        text = " ".join(segments[i]["text"] for i in c["segmentIds"])
        out += [f"## {c['title']}","",c["slide_text"][:600],"",text[:6000] or "_No matching caption text._",""]
        if text:
            cards += [f"Q: What was covered in {c['title']}?","A: "+text[:400],""]
    out += ["## Review prompts","","1. What are the main arguments?","2. Which terms need clarification?","3. How does this lecture relate to previous material?"]
    record = {
        "id":"l_"+uuid.uuid4().hex[:12], "kind":"lecture","parent":"inbox","title":title,
        "created":int(dt.datetime.now().timestamp()*1000), "updated":int(dt.datetime.now().timestamp()*1000),
        "source":"panopto-captions","panopto_url":url,"caption_source":source,"timed_captions":True,
        "segments":segments,"chunks":chunks,"generated":{"study-pack.md":"\n".join(out),
                         "flashcards.md":"\n".join(cards)},
        "body":"","status":"complete","duration":int(end),"slide_count":len(pages),
        "caption_reviewed":False,"alignment_estimated":bool(pages)
    }
    return {"version":1,"records":{record["id"]:record},"deleted":{}}

def main():
    parser = argparse.ArgumentParser(description="Use existing Panopto captions without rerunning Whisper")
    parser.add_argument("url", help="Panopto Viewer URL, copied from your browser")
    parser.add_argument("--browser",choices=("chrome","safari","firefox","edge","brave"),default="chrome")
    parser.add_argument("--slides",type=Path,help="Optional PDF slides for estimated grouping")
    parser.add_argument("--output",type=Path,default=Path("lumen-panopto-import.json"))
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.hostname or "panopto" not in parsed.hostname.lower():
        parser.error("Expected an HTTPS Panopto recording URL")
    if args.slides and (not args.slides.is_file() or args.slides.suffix.lower() != ".pdf"):
        parser.error("--slides must reference an existing PDF")
    if not shutil.which("uvx"):
        parser.error("uvx is not installed. Install uv from https://docs.astral.sh/uv/")
    with tempfile.TemporaryDirectory(prefix="lumen-panopto-") as work:
        cmd=["uvx","yt-dlp","--no-playlist","--skip-download","--write-subs","--write-auto-subs",
             "--sub-langs","en.*,en","--sub-format","vtt/srt/best",
             "--cookies-from-browser",args.browser,
             "--paths",work,"--output","lecture.%(ext)s",args.url]
        result=subprocess.run(cmd,text=True,capture_output=True)
        if result.returncode:
            print(result.stderr[-3500:],file=sys.stderr)
            raise SystemExit("Panopto caption download failed. Sign in through your chosen browser, check permissions, or download captions manually in Panopto.")
        files=sorted(list(Path(work).glob("*.vtt"))+list(Path(work).glob("*.srt")))
        if not files:
            raise SystemExit("yt-dlp could not retrieve a timed subtitle track. In Panopto, use Captions → Download transcript, then import the file in Lumen.")
        source=max(files,key=lambda p:p.stat().st_size)
        segments=parse_captions(source.read_text(encoding="utf-8-sig"))
        if not segments:
            raise SystemExit("Caption download was empty or not recognised as VTT/SRT")
        pages=get_pages(args.slides)
        record=build("Panopto lecture",args.url,segments,pages,source.name)
        args.output.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding="utf-8")
        print(f"Imported {len(segments)} existing caption segments; {len(pages)} slide text pages.")
        print(f"Open Lumen → Sync settings → Import backup → {args.output.resolve()}")
        print("No Panopto cookies, passwords or credentials were included in the export.")

if __name__=="__main__":
    main()
