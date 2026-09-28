# typehint

Ask the TypeScript compiler for the real type at a location in your project.

`typehint` runs the TypeScript language service against your `tsconfig.json`, prints the hover (QuickInfo) text, and expands the type structurally up to a bounded depth. Coding agents can use it to check a type instead of guessing, reaching for `as any`, or calling deprecated APIs.

```console
$ typehint at --file src/sample.ts --line 19 --char 5
src/sample.ts:19:5
(property) bar: Bar
expanded: { baz: number; nested?: { ok: true; }; }
```

## Install

```bash
npm install -g @stanley2058/typehint-cli
# or
bun add -g @stanley2058/typehint-cli
```

Requirements:

- Node.js 20 or newer
- A TypeScript project with a `tsconfig.json`
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) on `PATH` for `typehint grep`

## Usage

### `typehint at`

Get the type at a known position.

```bash
# 1-based line and column
typehint at --file src/foo.ts --line 12 --char 8

# 0-based UTF-16 offset
typehint at --file src/foo.ts --pos 1234 --json
```

`--json` output:

```json
{
  "filePath": "/abs/path/src/sample.ts",
  "line": 19,
  "character": 5,
  "pos": 252,
  "kind": "property",
  "kindModifiers": "",
  "display": "(property) bar: Bar",
  "deprecated": false,
  "expandedType": "{ baz: number; nested?: { ok: true; }; }"
}
```

When the symbol has a `@deprecated` tag, `deprecated` is `true` and `deprecatedText` carries the tag's message.

### `typehint grep`

Search with ripgrep, then run `at` on each match. Matches inside comments, strings, template literal text, regex literals, and JSX text are dropped.

```bash
typehint grep --regex 'foo\.bar' --target bar --glob '**/*.ts'
```

`--target` picks the substring inside the match to hover, so `foo.bar` resolves `bar` and not `foo`.

Exit codes:

| Code | Meaning |
| ---- | ------- |
| `0`  | Exactly one valid candidate |
| `1`  | Usage or runtime error |
| `2`  | No matches, or every match was filtered out or had no QuickInfo |
| `3`  | Several valid candidates; the output lists them |

### Expansion limits

| Flag | Default | Effect |
| ---- | ------- | ------ |
| `--no-expand` | | Print only the hover text |
| `--depth <n>` | `2` | Maximum nesting depth |
| `--maxProps <n>` | `50` | Properties shown per object |
| `--maxUnion <n>` | `10` | Union members expanded |
| `--maxChars <n>` | `4000` | Truncate `expandedType` after this many characters |

Run `typehint --help` for every flag.

## Workspace daemon

Building a TypeScript program is the slow part of each query. By default the first query starts a background daemon for the project, and later queries reuse its incremental program. The daemon exits after 5 minutes idle. If the daemon can't start, for example inside a sandbox without Unix sockets, `typehint` falls back to a one-shot local run.

| Setting | Values |
| ------- | ------ |
| `--engine` / `TYPEHINT_ENGINE` | `auto` (default), `daemon`, `local`, `lsp` |
| `--lsp` / `TYPEHINT_LSP_ENDPOINT` | Endpoint to try before the daemon: `unix:/path.sock` or `tcp:host:port` |
| `TYPEHINT_DAEMON_IDLE_MS` | Idle timeout in milliseconds (default `300000`) |

Sockets live in `$XDG_RUNTIME_DIR`, or the system temp directory when that is unset. Each socket is keyed by project, user, and `typehint` version, so upgrading never reuses an old daemon.

## Agent skill

The package ships a skill that teaches agents when and how to call `typehint`. Install it into one or more skills directories:

```bash
# Default: ~/.agents/skills
typehint install-skill

# Claude Code and others
typehint install-skill --dest ~/.agents/skills --dest ~/.claude/skills
```

## Development

```bash
bun install
bun run typehint --help   # run from source
bun test
bun run typecheck
bun run build             # writes dist/index.js
```

## License

MIT
