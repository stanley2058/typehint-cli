import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function usage(): never {
  const msg = [
    "install-skill.ts",
    "",
    "Copies the typehint skill into ~/.agents/skills/ so other agents can use it.",
    "",
    "Usage:",
    "  bun run scripts/install-skill.ts [--dest <dir>]",
    "",
  ].join("\n");
  process.stderr.write(msg);
  process.exit(1);
}

function parseDest(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") usage();
    if (a === "--dest") {
      const v = argv[i + 1];
      if (!v) usage();
      return v;
    }
  }
  return undefined;
}

const destFlag = parseDest(process.argv.slice(2));
const home = process.env.HOME;
if (!home && !destFlag) {
  throw new Error("$HOME is not set; pass --dest explicitly");
}

const repoRoot = process.cwd();
const src = path.join(repoRoot, "skills", "typehint", "SKILL.md");
if (!fs.existsSync(src)) {
  throw new Error(`Skill file not found: ${src}`);
}

const destRoot = destFlag ? path.resolve(destFlag) : path.join(home!, ".agents", "skills");
const destDir = path.join(destRoot, "typehint");
const dest = path.join(destDir, "SKILL.md");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);

process.stdout.write(`Installed: ${dest}\n`);
