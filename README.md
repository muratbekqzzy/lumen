# Lumen

A personal knowledge universe for lifelong learning.

Lumen keeps everything you learn in one place that you organise yourself, shows how it all
connects as an interactive graph, turns recorded lectures into study material, and lets any
AI assistant read from and add to it through the Model Context Protocol (MCP).

## What it does

- **Universe.** The home screen is a living graph: each section is a galaxy, lectures, notes and
  concepts are stars, and shared concepts bridge your subjects. Tap a star to see its connections.
- **Your structure.** Sections › modules › lectures and notes, in one folder tree. Create, rename,
  reorder, drag, move and archive. Every change is versioned and can be undone.
- **Lecture pipeline.** A recording plus slides becomes a slide-by-slide transcript (transcribed on
  your own Mac with Whisper), a study pack, flashcards and further resources.
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

## Study workflow status

The hosted app imports captions or pasted transcripts and prepares labelled,
extractive study outlines. It does not yet transcribe uploaded recordings or call
an AI generator. Prepared assistant output can be saved into a lecture with **Add
study material**. **Copy tutor prompt + source** provides a reusable teaching prompt
for concept synthesis, worked examples, useful cards, interactive explorations and
quizzes. This is an explicit hand-off to your assistant; it does not run GPT in the app.
Original slide PDFs now render locally and sync through private account storage
(20 MiB per file). Earlier text-only imports need their original PDFs reattached.
Local Whisper transcription and the MCP connector belong to the
separate Mac app. See the [study-workflow audit](docs/STUDY_WORKFLOW_AUDIT.md) for
verified behavior, repairs and remaining production work.

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
