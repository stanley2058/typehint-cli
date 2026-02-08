# typehint

CLI for getting TypeScript hover info + bounded structural type expansion via the TypeScript language service.

It is intended to help coding agents avoid `as any` and deprecated API guessing by cheaply grounding types.

## Requirements

- Bun
- TypeScript project with a `tsconfig.json`
- `rg` (ripgrep) for `typehint grep`

## Install

```bash
bun install
```

## Run (dev)

```bash
bun run typehint --help
```

Examples:

```bash
# Get info at a position (1-based line/char)
bun run typehint at --file fixtures/sample.ts --line 19 --char 5

# Search then typehint candidates (filters out comments/strings)
bun run typehint grep --regex 'foo\\.bar' --target bar --glob '**/*.ts'
```

## Build

```bash
# Bundle for Bun runtime
bun run build

# Optional: standalone executable for current platform
bun run build:compile
```

Build outputs:
- `dist/typehint.mjs` (bundle)
- `dist/typehint` (compiled executable, if built)

Run built artifacts:

```bash
# Bundled script
./dist/typehint.mjs --help

# Compiled executable
./dist/typehint --help
```

## Install Skill

This repo includes a skill doc for other agents at `skills/typehint/SKILL.md`.

To install into `~/.agents/skills/`:

```bash
bun run install-skill
```
