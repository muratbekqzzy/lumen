# Lumen

Live web interface: https://muratbekqzzy.github.io/lumen/

This is a **separate browser edition** of Lumen. The existing Python/Mac app remains unchanged.
The browser edition supports notes, sections, modules, graph, search, offline work,
backup import/export, and encrypted GitHub sync. The Mac app still handles recordings
and transcription, and is the source of original PDFs and media. The two apps do not
automatically exchange the original on-disk vault.

## Configure encrypted automatic sync

1. Open the Lumen web page and choose **Sync settings** at the bottom.
2. Create a **new private GitHub repository**, e.g. `lumen-private-data`, with no starter files.
   **Do not use this public Lumen code repository for your private knowledge data.**
3. Create a **fine-grained GitHub personal access token** restricted to that private
   data repository. Grant **Contents: Read and write** and no unrelated permissions.
4. In Lumen enter your GitHub username, data repository name, token, and a
   **unique encryption password of 12+ characters**.
5. Open Lumen on another device and enter the same credentials. Each device
   maintains an offline copy and syncs when connected, on edits, on focus, and
   while the app is open. Sync is automatically resumed on reloading the **same
   browser tab**; newly opened browser sessions must be unlocked again.

The app encrypts data with AES-256-GCM and a PBKDF2-SHA256-derived key before
writing `lumen-vault.enc.json` to GitHub. It stores the token and passphrase in
**sessionStorage only**, not in this repository. Be aware that a compromised browser
session can access sessionStorage. Do not share credentials in chat.

Updates use the GitHub Contents API with its SHA conflict check and re-read/retry
when a concurrent write is rejected. Individual records merge by last-updated
timestamp, which does **not** guarantee lossless merges of simultaneous edits to
the same note. Make periodic local backups; watch for sync errors in the status bar.

An encrypted GitHub file is **not a substitute for backups**. The app also saves
a local copy in your browser, which may be cleared by browser privacy settings.

## Import your existing Mac knowledge vault

From the Lumen project folder on your Mac:

```bash
uv sync
uv run python tools/export_cloud.py
```

This writes `lumen-cloud-import.json` into the current folder. Open Lumen,
choose **Sync settings → Import backup**, and select that file.

The exporter includes Markdown notes, sections, modules, imported lecture study-pack
text, flashcards, and lecture notes. It deliberately excludes original PDF slides,
recordings, transcripts linked to media, Git history, and hidden/source files.

Importing creates a **merged copy**, not a bidirectional live bridge to ~/Knowledge.
If you continue editing separately in the original Mac app, export/import again or
use the web app as your primary editor.

## Publishing and updates

A GitHub Actions workflow in `.github/workflows/lumen-cloud.yml` publishes
`cloud/index.html`, `cloud/cloud.js`, and static assets from `web/` after
changes to `main`. Check **Actions → Publish Lumen** for deployment status.

Do not move tokens or vault content into `web/`, `cloud/`, or public git history.

## Current limitations

- The website is public but the data repository is private and encrypted.
- Browser edition: no on-device Whisper processing or Python MCP server.
- Changes to the code can be made through GitHub pull requests or with ChatGPT's
  connected GitHub access.
- Synchronization requires an active authorized session and internet connection;
  it cannot run continuously when the browser is closed.

## Panopto lecture importing

Use **Lumen → a section or Inbox → Add lecture**.

1. Copy the university Panopto Viewer link.
2. In Panopto, use **Captions → Download transcript**, or export a timed
   `.vtt`/`.srt` subtitle file if you have access to the caption files.
3. In Lumen, paste the Panopto link, attach the caption file and optionally
   the PDF lecture slides. Select **Structure lecture and save**.
4. Open the lecture and choose **Review captions** to correct technical terms.
   Saving corrections regenerates the extractive study-pack outline and
   draft flashcards. Changes save offline immediately, then sync with GitHub
   when your encrypted sync connection is active.

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
