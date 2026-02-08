import path from "node:path";
import process from "node:process";

export function printHelp() {
  const bin = path.basename(process.argv[1] ?? "typehint");
  process.stdout.write(
    [
      "typehint - TypeScript type hints via TS language service",
      "",
      "Usage:",
      `  ${bin} at --file <path> (--pos <offset> | --line <n> --char <n>) [options]`,
      `  ${bin} grep --regex <pattern> [--target <text>] [options]`,
      "",
      "Commands:",
      "  at    Get QuickInfo + expanded type at a position",
      "  grep  Search with ripgrep, then run 'at' on candidates",
      "",
      "Common options:",
      "  --project <path>      Path to tsconfig.json (or a directory containing it)",
      "  --json                Emit machine-readable JSON",
      "",
      "Type expansion options:",
      "  --expand / --no-expand   Enable/disable structural expansion (default: expand)",
      "  --depth <n>              Max expansion depth (default: 2)",
      "  --maxProps <n>           Max properties per object (default: 50)",
      "  --maxUnion <n>           Max union members to expand (default: 10)",
      "  --maxChars <n>           Truncate expandedType after N chars (default: 4000)",
      "",
      "Position options (at):",
      "  --pos <offset>        0-based UTF-16 offset in file",
      "  --line <n>            1-based line number",
      "  --char <n>            1-based character column",
      "",
      "Search options (grep):",
      "  --root <dir>          Search root (default: cwd)",
      "  --glob <pattern>      Repeatable ripgrep glob; example: --glob '**/*.ts'",
      "  --maxCandidates <n>   Stop after N matches (default: 20)",
      "  --target <text>       Substring inside the match to compute a precise position",
      "  --submatch <n>        Which rg submatch to use (default: 0)",
      "  --includeNodeModules  Include node_modules in search (default: false)",
      "",
      "Examples:",
      `  ${bin} at --file src/foo.ts --line 12 --char 8`,
      `  ${bin} grep --regex 'foo\\.bar' --target bar --glob '**/*.ts'`,
      "",
    ].join("\n"),
  );
}
