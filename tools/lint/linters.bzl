"""Python lint and type-check aspects."""

load("@aspect_rules_lint//lint:lint_test.bzl", "lint_test")
load("@aspect_rules_lint//lint:ruff.bzl", "lint_ruff_aspect")
load("@aspect_rules_lint//lint:ty.bzl", "lint_ty_aspect")

ruff = lint_ruff_aspect(
    binary = Label("@multitool//tools/ruff"),
    configs = [Label("@//:ruff.toml")],
)

ruff_test = lint_test(aspect = ruff)

ty = lint_ty_aspect(
    binary = Label("@multitool//tools/ty"),
    config = Label("@//:ty.toml"),
)

ty_test = lint_test(aspect = ty)
