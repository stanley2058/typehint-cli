import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getFlagStrings, parseArgs } from "../args.ts";

const SKILL_REL = path.join("skills", "typehint", "SKILL.md");

// The skill ships next to the package root, which sits at a different depth
// from the running module in the bundle (dist/) and in dev (src/lib/commands/).
function findBundledSkill(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, SKILL_REL);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function typehintInstallSkill(params: { argv: string[]; cwd: string }): Promise<number> {
  const parsed = parseArgs(params.argv);

  if (parsed.flags.help === true || parsed.flags.h === true) {
    process.stdout.write(
      [
        "Usage: typehint install-skill [--dest <skills-dir>]...",
        "",
        "Copies the typehint agent skill to <skills-dir>/typehint/SKILL.md.",
        "Default <skills-dir>: ~/.agents/skills (repeat --dest for several targets)",
        "",
        "Example:",
        "  typehint install-skill --dest ~/.agents/skills --dest ~/.claude/skills",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const src = findBundledSkill();
  if (!src) {
    process.stderr.write(`Could not locate bundled ${SKILL_REL}\n`);
    return 1;
  }

  const destFlags = getFlagStrings(parsed.flags, "dest");
  const roots = destFlags.length > 0 ? destFlags : [path.join(os.homedir(), ".agents", "skills")];

  for (const root of roots) {
    const destDir = path.join(path.resolve(params.cwd, expandHome(root)), "typehint");
    const dest = path.join(destDir, "SKILL.md");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    process.stdout.write(`Installed: ${dest}\n`);
  }

  return 0;
}
