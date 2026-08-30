# Knowledge graph: graphify (added 2026-08-30)

This repo has a graphify knowledge graph at `graphify-out/graph.json` — a map
of how every file, function, and doc in this project connects (761 nodes,
1916 edges as of the first build). graphify itself is a separate CLI
installed globally (`~/Documents/graphify`, `uv tool install graphifyy`),
not part of this repo's dependencies.

**Rule: before answering a question about how this codebase is structured
or how pieces connect, refresh the graph first with `graphify --update`
(cheap — it only re-extracts changed files), then use
`graphify query "<question>"` instead of re-reading every file from
scratch.** This applies to any agent working in this repo, not just the
original session that built it. Skip this for trivial questions that don't
need cross-file context.

`graphify-out/` (the graph itself, `graph.html`, and the extraction cache)
is a regenerable build artifact and is gitignored — run
`graphify --update` to rebuild it rather than expecting it to already be
present after a fresh clone.
