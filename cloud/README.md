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
Original recordings, original PDF files and the local Python MCP server are not
part of browser sync. Imported lecture text, notes, captions, flashcards, sections,
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

## Development and publication

- `cloud/cloud.js`: browser adapter, local persistence, automatic synchronization.
- `cloud/migrate.js`: validated one-time migration from the original origin.
- `hosted/sync.mjs`: authenticated sync API and atomic D1 snapshots.
- `db/schema.ts`, `drizzle/`: schema and generated migrations applied during deployment.
- `hosted/build.mjs`: bundles the existing UI and API into a hosted Worker.
- `.openai/hosting.json`: existing Site identity and storage binding.

Run `node --test cloud/tests.test.cjs cloud/migrate.test.cjs hosted/*.test.mjs`
and `node hosted/build.mjs` to validate/build. Deployment requires source push and
the Sites publishing workflow; rebuilding files alone does not update production.
The GitHub Actions workflow publishes the original-address browser app and
migration entry point after changes to `main`.

## Panopto lecture importing

Use **Lumen → a section or Inbox → Add lecture**.

1. Copy the university Panopto Viewer link.
2. In Panopto, use **Captions → Download transcript**, or export a timed
   `.vtt`/`.srt` subtitle file if you have access to the caption files.
3. In Lumen, paste the Panopto link, attach the caption file and optionally
   the PDF lecture slides. Select **Structure lecture and save**.
4. Open the lecture and choose **Review captions** to correct technical terms.
   Saving corrections regenerates the extractive study-pack outline and
   draft flashcards. Changes save offline immediately, then sync with your account when you are online.

Lumen accepts caption text instead of rerunning Whisper, and this avoids
the browser/Python mismatch that previously blocked lecture uploading.
**Panopto link-only access from GitHub Pages is not currently supported**
because university videos and captions may require an authenticated,
cross-origin Panopto session. **Do not put university account passwords
or session cookies into Lumen's web form or GitHub repository.**

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
extracted into the synced lecture record; the original PDF pages/images
and lecture recordings are not uploaded to GitHub. Generated notes and
flashcards are draft, extractive study aids: they are not reviewed by an AI,
cannot automatically correct terminology and should be checked against the
lecture. Edits to imported lectures can have conflicts if two devices edit
the same record simultaneously; avoid simultaneous edits and keep backups.
