# Lumen

A personal knowledge universe for lifelong learning.

Lumen keeps prepared learning material in one organised, synced library. Import a
single Markdown file, read its explanations and interactive visuals, optionally add
original slides, and keep your own notes alongside it.

## What it does

- **Universe.** The home screen is a living graph: each section is a galaxy, lectures, notes and
  concepts are stars, and shared concepts bridge your subjects. Tap a star to see its connections.
- **Your structure.** Sections › modules › lectures and notes, in one folder tree. Create, rename,
  reorder, drag, move and archive. Every change is versioned and can be undone.
- **Markdown import.** One prepared file creates or updates the correct section,
  module and lecture. No recording, transcript or PDF is required. Lecture and Slides
  are the reading views; existing notes and sources are preserved.
- **Rich study material.** Maths, interactive charts, interactive explainers and
  "check your understanding" quizzes render inside notes.
- **Concepts.** Write `[[Concept]]` anywhere, Obsidian-style. Each concept gets its own page and
  links everything that mentions it.
- **AI connector (MCP).** Assistants can search, read lectures and add study material. They cannot
  change your structure, edit your own notes or touch original sources.

## Where things live

| What | Where |
|---|---|
| The app, connector and pipeline | this folder |
| Your knowledge: plain folders and Markdown, versioned with git | `~/Knowledge` (set `LUMEN_VAULT` to change) |
| Lecture recordings (large, kept out of git) | `~/Knowledge/.media` |

The vault is readable without Lumen. Each lecture keeps `Source/` (originals, never changed by AI),
`Generated/` (AI study material, can be regenerated) and `My Notes/` (yours, never overwritten by AI).
Your vault is **not** part of this repository.

## Study workflow

Choose **Import Markdown**. A short destination header identifies the section,
module and lecture; **Get a template** supplies the format. Files without a header
can use the current lecture or a destination you choose. Lumen renders prepared
explanations, images, maths, charts, widgets and quizzes directly. It does not call
an AI generator, transcribe a recording or generate flashcards during import.

Slides are optional, with private storage and local rendering (20 MiB per PDF).
**Add a question** saves a question and answer directly. Your practice questions
appear below the lecture with answers you can reveal. Supplied Markdown flashcards
render as a deck with Show answer and Previous/Next controls. The lecture Notes tab is
hidden for now; existing note text remains stored.
See the [one-file import guide](docs/MARKDOWN_IMPORT.md) for the format and limits.
The Python/Mac transcription and MCP tools documented below remain separate.

## Open it without installing anything

Use [Lumen with automatic device sync](https://lumen-knowledge-sync.noisyagate9.chatgpt.site).
Sign in with the same account on your phone, tablet and computer. Notes and library
changes sync automatically while the app is open; offline changes upload when you
reconnect. No Python, terminal or GitHub token is needed for the browser app.
See [browser sync and existing-note migration](cloud/README.md) for details.

The instructions below run the separate local Mac app for transcription and MCP.

## Run it

Requires macOS on Apple Silicon (for on-device Whisper), Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

```bash
uv run python -m lumen.server
```

Then open http://127.0.0.1:4321. On a Mac you can also double-click `Lumen.command`.

## The connector (MCP)

Tools: `list_library`, `search`, `get_lecture`, `get_slide`, `list_concepts`, `read_note`,
`save_study_material`, `save_explanation`, `add_note`.

Local (Claude desktop, Claude Code and other stdio clients):

```bash
uv run python -m lumen.mcp_server
```

Over HTTP on port 4322, for clients that connect by URL. Put it behind a secure tunnel with
authentication before exposing it:

```bash
uv run python -m lumen.mcp_server --http
```

## Formats assistants can save

- Maths: `$inline$` and `$$display$$`
- Interactive charts: a `plotly` code block containing Plotly JSON
- Interactive explainers: a `widget` code block with self-contained HTML and JavaScript (runs sandboxed)
- Quizzes: a `quiz` code block containing JSON questions
- Concept links: `[[Concept name]]`

## Layout

```
lumen/     server, vault, lecture pipeline, search, graph, MCP connector
web/       the interface (plain HTML, CSS and JavaScript, no build step)
backup.sh  pushes the vault to its own private git remote
```
