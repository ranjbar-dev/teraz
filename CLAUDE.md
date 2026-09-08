@AGENT.md

The generated Next.js instructions in `AGENTS.md` also apply. Preserve the
`BEGIN:nextjs-agent-rules` block because `next dev` maintains it.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions on Windows, first run `py -m graphify query "<question>"` when graphify-out/graph.json exists. Use `py -m graphify path "<A>" "<B>"` for relationships and `py -m graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `py -m graphify update .` to keep the graph current (AST-only, no API cost).
