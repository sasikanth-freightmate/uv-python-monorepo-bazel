#!/usr/bin/env bash
# Wired into .bazelrc as workspace_status_command.
# Bazel prints the stable/volatile key=value pairs we emit on stdout; we use
# stderr for the warning so it's visible in `bazel build` output.

set -euo pipefail

# Skip when not inside a git tree, or when running as root (e.g. CI containers).
if [[ "$(id -u)" == "0" ]]; then
    exit 0
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    exit 0
fi

if [[ -z "$(git config --get core.hooksPath || true)" ]]; then
    cat >&2 <<'EOF'
================================================================================
  WARNING: git config option `core.hooksPath` is not set.

  This repository ships hooks in `githooks/` for automatic formatting and
  hygiene checks before commits.

  Enable with:
      git config core.hooksPath githooks

  Silence this warning by adding to user.bazelrc:
      build --workspace_status_command=/usr/bin/true
================================================================================
EOF
fi
