---
name: typehint
description: typehint cli help agents find actual types directly from LSP hints without needing to dig into node_modules, eliminating the need for `as any` and deprecated API misuse.
allowed-tools: Bash(typehint:*)
---

# typehint

This skill helps you avoid `as any` and deprecated API guesses by querying the TypeScript compiler for the _actual_ type at a usage site.

It is backed by the TypeScript language service (not LSP) and supports two main workflows:

- `typehint at`: precise type at a known location
- `typehint grep`: search first, then typehint candidate locations (filters out comments/strings)

## Requirements

- `rg` (ripgrep) available on PATH for `typehint grep`
- A TypeScript project with a `tsconfig.json`

## Command: typehint at

Use this when you know the file + position.

```bash
# 1-based line/char
typehint at --file src/foo.ts --line 12 --char 8

# 0-based UTF-16 offset
typehint at --file src/foo.ts --pos 1234
```

Useful flags:

- `--json` emit structured output
- `--depth <n>` cap structural expansion depth (default: 2)
- `--maxProps <n>` cap properties per object (default: 50)
- `--maxUnion <n>` cap union members expanded (default: 10)
- `--maxChars <n>` cap expansion size (default: 4000)

## Command: typehint grep

Use this when you only know a pattern (e.g. `foo.bar`) and need help locating the right occurrence.

```bash
typehint grep --regex 'foo\\.bar' --target bar --glob '**/*.ts'
```

Notes:

- It ignores matches inside comments, strings, template literal text, regex literals, and JSX text.
- Prefer `--glob` to keep search tight.
- Use `--target` to compute the exact offset within the match (so hover hits the right symbol).

Exit codes:

- `0` exactly one valid candidate; output is that candidate
- `2` no matches (or all matches filtered / no QuickInfo)
- `3` multiple valid candidates; output includes a candidate list

## JSON Output

`typehint at --json` returns an object with fields like:

- `filePath`, `line`, `character`, `pos`
- `display` TypeScript QuickInfo display text (hover string)
- `expandedType` bounded structural expansion (may be absent if `--no-expand`)
- `deprecated` / `deprecatedText` if `@deprecated` is present

`typehint grep --json` returns:

- `regex`, `root`
- `candidates[]` (each is the same shape as `typehint at` output plus optional `error`)

## Recommended Agent Workflow

1. If you have a location: use `typehint at --json`.
2. Otherwise: use `typehint grep --json` with a narrow `--glob` and a precise `--target`.
3. If exit code is `3`, pick the correct candidate by inspecting `preview` + `display`, then rerun `typehint at` on that exact location.
