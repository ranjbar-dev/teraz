# Graphify workflow

Graphify maintains a generated knowledge graph and architecture report for this
repository. Its committed outputs live in `graphify-out/`:

- `graph.json`: machine-readable graph used by agent queries.
- `GRAPH_REPORT.md`: generated architecture and graph audit report.
- `graph.html`: interactive visualization.
- `manifest.json`: fingerprints used for incremental updates.

The graph is an index, not a replacement for source code or the maintained
documents in `docs/`. Never edit generated Graphify files by hand.

## Prerequisite

Install the Python package that provides Graphify. On Windows, invoke the same
interpreter consistently through the Python launcher:

```powershell
py -m pip install "graphifyy>=0.8.35"
py -m graphify --version
```

Semantic extraction of prose and images additionally needs a supported LLM
backend key. Keep API keys in the environment, never in this repository.

## Refresh commands

For ordinary code changes, run the deterministic, API-free update:

```powershell
py -m graphify update .
```

For changed Markdown, papers, images, or when semantic relationships need to be
rebuilt, run a full extraction with an available backend:

```powershell
py -m graphify extract .
```

Use `--backend <name>` when backend auto-detection is not appropriate. Review
the generated diff before committing it; generated claims are an aid, while the
source remains authoritative.

## Automatic hooks

Run this once in every clone because `.git/hooks/` is intentionally local:

```powershell
py -m graphify hook install
py -m graphify hook status
```

Graphify installs `post-commit` and `post-checkout` hooks. They refresh the
deterministic graph and `GRAPH_REPORT.md` in the background after commits and
branch switches. Output is logged to the user Graphify rebuild log. A commit can
therefore leave regenerated `graphify-out/` files dirty; review and include them
in the next commit when they changed.

The repository also contains `.codex/hooks.json`, `.claude/settings.json`, and
Graphify sections in `AGENTS.md` and `CLAUDE.md`. They remind coding agents to
query the graph before broad codebase searches and refresh it after edits.

## Human-maintained documentation

The hook only regenerates Graphify artifacts; it cannot decide whether product
or operational prose is accurate. Every implementation change must also follow
the documentation matrix in `AGENT.md`. Update the relevant maintained document
in the same change whenever behavior, architecture, commands, configuration,
limitations, or verified status changes.
