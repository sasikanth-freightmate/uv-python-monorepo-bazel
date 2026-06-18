# Claude Code conventions

Read [AGENTS.md](AGENTS.md) first — it contains the ADR index and test layout conventions that apply to all AI tools on this repo.

## Build system

- Bazel with `aspect_rules_js` (frontend) and `aspect_rules_py` (Python)
- Run tests: `bazel test //apps/flow_backend:all`
- Filter by tag: `bazel test //apps/flow_backend:all --test_tag_filters=unit`
- Dev server: `ibazel run //apps/flow-ui:dev` (do not run `next build/start` manually)
