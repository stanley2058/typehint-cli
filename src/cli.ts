import path from "node:path";
import process from "node:process";

import { typehintAt } from "./lib/commands/at.ts";
import { typehintGrep } from "./lib/commands/grep.ts";
import { printHelp } from "./lib/help.ts";

declare global {
  // injected at build time in real releases
  var PACKAGE_VERSION: string;
}

globalThis.PACKAGE_VERSION = "dev";

function isHelpFlag(s: string) {
  return s === "-h" || s === "--help";
}

async function main(argv: string[]) {
  const [cmdRaw, ...rest] = argv;

  if (!cmdRaw || isHelpFlag(cmdRaw)) {
    printHelp();
    return 0;
  }

  const cmd = cmdRaw.toLowerCase();
  if (cmd === "help") {
    printHelp();
    return 0;
  }

  if (cmd === "at") {
    const res = await typehintAt({
      argv: rest,
      cwd: process.cwd(),
    });
    return res;
  }

  if (cmd === "grep") {
    const res = await typehintGrep({
      argv: rest,
      cwd: process.cwd(),
    });
    return res;
  }

  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    // Best-effort: avoid dynamic reading of package.json in MVP.
    process.stdout.write(`typehint (${PACKAGE_VERSION})\n`);
    return 0;
  }

  process.stderr.write(
    `Unknown command: ${cmdRaw}\n\nRun: ${path.basename(process.argv[1] ?? "typehint")} --help\n`,
  );
  return 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`${msg}\n`);
    process.exitCode = 1;
  });
