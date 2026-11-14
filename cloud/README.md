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
