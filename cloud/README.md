# Lumen — automatic device sync

Synced app: https://lumen-knowledge-sync.noisyagate9.chatgpt.site

Original browser app: https://muratbekqzzy.github.io/lumen/

## Use it on any device

Open the synced app and sign in with the same ChatGPT account on each device.
The app is publicly accessible; each signed-in account has its own private library. No GitHub token, repository, encryption password,
Python installation, terminal command, or running Mac is needed for browser sync.
Settings shows the signed-in account and the current sync status.

Changes save in a device-local, account-scoped cache immediately. While Lumen is
open, edits upload automatically, other devices check about every five seconds,
and returning to the app or reconnecting triggers an immediate check. Failed
requests retry with a bounded backoff. An expired session shows a sign-in link.
Browser throttling and network conditions can delay updates. A closed browser
cannot sync; pending saved edits upload the next time the app opens online.

The hosted backend uses authenticated per-user storage, atomic revision checks,
and three-way merging. Concurrent edits to the same record keep a deterministic
**(conflict copy)**; review both versions in the library. Undo is a new synchronized
change. Incoming updates do not replace an unsaved editor draft. The sync
indicator distinguishes locally saved changes, syncing, synced, offline and errors.

## Sky, Space and motion

Use the **Sky / Space** control at the bottom of the sidebar to switch between
lavender twilight and a dark starfield. The choice stays on this device. The
Universe graph has a **Drift / Still** control for gentle motion; your device's
reduced-motion setting always takes priority. Hidden tabs pause graph animation.
Notes and study pages keep a quieter atmosphere for reading. The empty Universe
is decorative until you create your own sections; it never adds sample records.

## Existing notes

The original address keeps your existing browser library and offers **Open synced
Lumen** and backup export. The new app attempts a one-time, origin-checked import
from this browser's original library. Browsers that isolate embedded storage may
require exporting a backup at the original address and choosing **Settings →
Import backup** in the new app. Existing notes are never deleted by migration.
Only library records transfer; old credentials are never sent to the hosted app.
An encrypted GitHub copy that exists only remotely is not automatically imported;
use an existing device's locally saved library or a previously exported backup.
The old app no longer asks for or uses GitHub credentials. Existing remote encrypted
files remain untouched.

The Python/Mac app and its `~/Knowledge` folder are a separate library. To bring
that library over, use the existing `tools/export_cloud.py` exporter and import its
JSON backup. This is a one-time merged copy, not a live sync of Mac folders.
Original recordings and the local Python MCP server are not part of browser sync.
Original PDFs from the Mac exporter must be attached separately in the browser.
Imported lecture text, notes, captions, flashcards, sections,
modules and their organization are synchronized.

## Privacy and backups

Authentication is provided by Sites. Every read/write is authorized on the server
using the signed-in account's stable ID; client-supplied account IDs cannot grant
access. Sessions are managed by the host, with no manually managed secrets in
Lumen. Data travels over HTTPS and lives in private hosted storage. This mode does
not use the previous password-based end-to-end encryption: the authenticated
backend processes library content to store it.

Accounts have separate local caches and checkpoints. Signing out clears the active
account's local library cache. On a shared device, sign out when finished. Browser
storage can be cleared by privacy settings; export backups regularly from Settings.
A library can contain up to 8 MiB in the current sync format; larger libraries
remain saved locally and show a clear backup/export message instead of claiming
success. Sync is not a substitute for independent backups.

Original PDFs use separate private file storage: up to 20 MiB per file and 500 MiB
or 300 files per account. The browser caches originals in account-scoped IndexedDB
and retries pending uploads when Lumen is open online. Library snapshots contain
small file references. JSON backups contain those references and extracted text,
not the original PDF bytes; retain independent copies of your source files.
Signing out waits for pending file uploads and clears that account's PDF cache.
Replacing or deleting a lecture does not yet reclaim its old cloud PDF objects.

## Development and publication

- `cloud/cloud.js`: browser adapter, local persistence, automatic synchronization.
- `cloud/migrate.js`: validated one-time migration from the original origin.
- `hosted/sync.mjs`: authenticated sync API and atomic D1 snapshots.
- `hosted/files.mjs`, `web/pdf.js`: private original PDF storage and local rendering.
- `web/tutor.js`: reusable teaching prompt and complete lecture-source hand-off.
- `db/schema.ts`, `drizzle/`: schema and generated migrations applied during deployment.
- `hosted/build.mjs`: bundles the existing UI and API into a hosted Worker.
- `.openai/hosting.json`: existing Site identity and storage binding.

Run `node --test cloud/tests.test.cjs cloud/migrate.test.cjs hosted/*.test.mjs`
and `node hosted/build.mjs` to validate/build. Deployment requires source push and
the Sites publishing workflow; rebuilding files alone does not update production.
The GitHub Actions workflow publishes the original-address browser app and
migration entry point after changes to `main`.

### Scoped maintenance import

`POST /api/maintenance/lecture-materials` is disabled by default. A hosting owner
can temporarily provision secret `LUMEN_MATERIAL_IMPORT_TOKEN` and
`LUMEN_MATERIAL_IMPORT_PERMIT` values for a user-authorized three-file import.
The permit fixes one account, exact course ID/title, lecture number, batch ID,
expiry and SHA-256 of the complete approved request. No uploaded content or
credentials belong in source code, public assets or Git history.

The authenticated operation previews the unique target before applying, commits
all three files through the ordinary atomic revision guard, preserves unrelated
content and stores replaced material in a private receipt. Reusing the batch does
not overwrite later edits. Verify the saved file hashes, remove both secrets and
redeploy immediately after the authorized import. Without a current permit and
secret the route returns 404; ordinary library access still requires user sign-in.

## Lecture study workflow

1. Choose **Add lecture** in a section or the Inbox.
2. Upload `.vtt`, `.srt` or `.txt` captions, or paste a transcript. Add a title.
3. Optionally attach a PDF and a Panopto playback link. The actual PDF pages display
   even when the file has no selectable text; this does not perform OCR.
4. Import, then **Review captions**. Find technical terms using the caption search.
5. Use the draft outline and review questions, or **Copy tutor prompt + source** to work
   with an external assistant. **Add study material** saves prepared Markdown,
   Q:/A: flashcards, explanations or verified resources into the same lecture.

This browser edition does **not** transcribe recordings or call an AI generator.
Its automatic outlines are extractive drafts. Caption review can rebuild those
outlines explicitly; existing resources and personal notes are retained. When
prepared materials are kept after transcript edits, a stale-material notice asks
for review. Caption IDs are stable lookup keys, not array positions.

The original source transcript is retained in the lecture. Long outlines are
labelled excerpts. Untimed text has estimated grouping and no fabricated Panopto
playback links. Matching text to PDF pages is approximate, not verified slide timing.
Original PDFs are preserved privately on the synced app and rendered by a local
PDF.js bundle. Earlier imports kept only extracted text: use **Attach original
PDF** in the lecture toolbar to restore their pages. Recordings are not stored by
this importer. The chart and math renderers still use external browser libraries.
The tutor prompt copies text only; attach the original PDF to your assistant when
its figures matter. Prepared results can be pasted back through Add study material.

Tables, fenced quizzes, plots and sandboxed widgets now render through a local
Markdown engine. Lecture search includes captions, slide text, prepared materials
and personal notes. The Universe includes concept links from study materials and
excludes archived records and code examples.

SPSS Studio remains at `web/spss.html`; its progress is browser-local. It can later
be embedded or linked within a statistics section while retaining this address.
It is a teaching module, not a running IBM SPSS installation or an AI tutor.

### One-command link import on your Mac

For compatible authorised Panopto recordings, a Mac helper can use the
existing signed-in browser session and yt-dlp's Panopto extractor to retrieve
captions from the URL directly:

```bash
uv run python tools/panopto_from_link.py "https://YOUR-UNIVERSITY.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=..." --browser chrome --slides "/path/to/slides.pdf"
```

The helper uses `uvx yt-dlp`, looks for existing subtitle tracks, and
writes `lumen-panopto-import.json` for import through **Sync settings →
Import backup**. It does not upload browser cookies to GitHub or use
Whisper. If Panopto does not expose caption files to the extractor, the
helper fails explicitly and you should use Panopto's Download transcript
option and the website importer.

**Current accuracy limitations:** Timed captions preserve their timestamps,
but Panopto's common `.txt` transcript export may omit timestamps.
Matching transcripts to slide pages is currently approximate. PDF text is
extracted into the synced lecture record; original PDFs are stored separately,
while lecture recordings are not uploaded. Generated notes and
flashcards are draft, extractive study aids: they are not reviewed by an AI,
cannot automatically correct terminology and should be checked against the
lecture. Edits to imported lectures can have conflicts if two devices edit
the same record simultaneously; avoid simultaneous edits and keep backups.
