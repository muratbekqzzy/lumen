"""Verify a publishable Lumen site contains every local CSS/JS reference."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import sys

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "script" and "src" in props:
            self.scripts.append(props["src"])
        if tag in ("script", "link", "img"):
            attr = "src" if tag in ("script", "img") else "href"
            if attr in props:
                self.refs.append(props[attr])

root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
index = root / "index.html"
assert index.exists(), f"Missing {index}"
html = index.read_text(encoding="utf-8")
parser = References()
parser.feed(html)
assert "<title>Lumen</title>" in html
assert "web/style.css" in parser.refs, "Lumen CSS is not linked"
assert parser.scripts.index("cloud/cloud.js") < parser.scripts.index("web/app.js"), "Browser adapter must load before app"
for ref in parser.refs:
    parsed = urlsplit(ref)
    if parsed.scheme or ref.startswith("//") or ref.startswith("#"):
        continue
    path = root / unquote(parsed.path.lstrip("/"))
    assert path.is_file(), f"Broken local asset reference: {ref} at {path}"
    assert path.stat().st_size > 0, f"Empty site asset: {ref}"
manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
assert manifest["name"] == "Lumen"
assert manifest["start_url"] == "./"
assert (root / "sw.js").is_file()
print("Lumen site integrity check passed:", len(parser.refs), "HTML asset references valid")
