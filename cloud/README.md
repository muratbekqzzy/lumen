# Lumen

Live web interface: https://muratbekqzzy.github.io/lumen/

This is a **separate browser edition** of Lumen. The existing Python/Mac app remains unchanged.
The browser edition supports notes, sections, modules, graph, search, offline work,
backup import/export, and encrypted GitHub sync. The Mac app still handles recordings
and transcription, and is the source of original PDFs and media. The two apps do not
automatically exchange the original on-disk vault.

## Configure encrypted automatic sync

1. Open Lumen and select the **small Settings gear beside the theme control**
   at the bottom of the sidebar. There is no floating sync toolbar.
2. Create a **separate private GitHub repository**, e.g. `lumen-private-data`,
   with no starter files. Never store personal notes in the public app-code repo.
3. Create a **fine-grained GitHub personal access token** limited to that private
   repository with **Contents: Read and write** access.
4. Enter your GitHub username, private data repository, access token, and a
   separate **encryption password (12+ characters)**. Check **Stay connected
   on this device** if this is your trusted computer or phone.
5. Repeat this connection once on every other device.

Once connected, Lumen saves changes locally immediately, pushes shortly after
edits, polls GitHub approximately **every 15 seconds while an app tab is active**,
and checks immediately after returning to the tab, regaining internet, or
opening Lumen. No manual Sync click is required. The gear has a small status
dot (green = synced, amber = syncing/pending, red = error).

GitHub's Contents API cannot send real-time push notifications to a static
website. Expect a delay of up to approximately 15 seconds for changes to appear
on another active device, sometimes longer because of network delays,
browser background throttling or API errors. Sync does not run while
Lumen is completely closed.

With **Stay connected on this device**, the access token and encryption
password are saved in the browser's local storage so subsequent visits sync
without requesting them again. This is convenient but increases exposure if
that browser/device is compromised or shared. On shared devices, uncheck it
so credentials persist only in the current browser session. Use Settings →
Disconnect to clear saved credentials on the current device. Never paste
tokens or passwords into ChatGPT or GitHub source files.

Lumen encrypts the vault with AES-256-GCM and PBKDF2-SHA256 before uploading
`lumen-vault.enc.json`. Every update uses the GitHub file SHA as an optimistic
concurrency guard, with retries on conflicts. Each device tracks record
fingerprints from the last successful sync: if the *same record* was edited on
two devices, it preserves a deterministic **(conflict copy)** rather than
silently dropping an edit. Review and reconcile any such copies manually.
The GitHub Contents API has file-size limitations, so periodically export
backups (Settings → Export backup), especially for large lecture collections.

Encrypted GitHub sync is not a substitute for backup. Local browser data
can be cleared by site-data cleanup or browser privacy settings.

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
