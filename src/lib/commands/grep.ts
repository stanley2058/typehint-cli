import path from "node:path";
import process from "node:process";

import {
  getFlagBoolean,
  getFlagNumber,
  getFlagString,
  getFlagStrings,
  parseArgs,
} from "../args.ts";
import { formatGrepHuman, formatGrepJson } from "../output.ts";
import { engineBatchAt, resolveEngine } from "../engine/engine.ts";
import { rgSearch } from "../search/rg.ts";
import { byteOffsetToUtf16Pos } from "../util/utf8.ts";
import { collectNonCodeRanges, isPosInNonCode } from "../ts/noncode.ts";
import { readFileSync } from "node:fs";
import { utf16PosToLineChar1Based } from "../util/linepos.ts";

export type TypehintGrepParams = {
  argv: string[];
  cwd: string;
};

export async function typehintGrep(params: TypehintGrepParams): Promise<number> {
  const parsed = parseArgs(params.argv);
  const regex = getFlagString(parsed.flags, "regex") ?? getFlagString(parsed.flags, "r");
  if (!regex) {
    process.stderr.write("Missing required flag: --regex\n");
    return 1;
  }

  const rootFlag = getFlagString(parsed.flags, "root");
  const root = rootFlag ? (path.isAbsolute(rootFlag) ? rootFlag : path.resolve(params.cwd, rootFlag)) : params.cwd;

  const json = parsed.flags.json === true;

  const expand = getFlagBoolean(parsed.flags, "expand", true);
  const depth = getFlagNumber(parsed.flags, "depth", { defaultValue: 2, min: 0 });
  const maxProps = getFlagNumber(parsed.flags, "maxProps", { defaultValue: 50, min: 0 });
  const maxUnion = getFlagNumber(parsed.flags, "maxUnion", { defaultValue: 10, min: 0 });
  const maxChars = getFlagNumber(parsed.flags, "maxChars", { defaultValue: 4000, min: 200 });

  const projectFlag = getFlagString(parsed.flags, "project") ?? getFlagString(parsed.flags, "p");

  const target = getFlagString(parsed.flags, "target") ?? getFlagString(parsed.flags, "t");
  const submatch = getFlagNumber(parsed.flags, "submatch", { defaultValue: 0, min: 0 });
  const maxCandidates = getFlagNumber(parsed.flags, "maxCandidates", { defaultValue: 20, min: 1 });
  const includeNodeModules = parsed.flags.includeNodeModules === true;

  const globs = getFlagStrings(parsed.flags, "glob");

  const matches = await rgSearch({
    regex,
    root,
    globs,
    maxMatches: maxCandidates,
    includeNodeModules,
  });

  if (matches.length === 0) {
    const out = { regex, root, candidates: [] as any[] };
    process.stdout.write(json ? formatGrepJson(out) : formatGrepHuman(out));
    return 2;
  }

  const candidates: any[] = [];
  const items: Array<{ filePath: string; pos: number; preview?: string; line?: number }> = [];

  const fileTextCache = new Map<string, string>();
  const nonCodeCache = new Map<string, ReturnType<typeof collectNonCodeRanges>>();
  const getFileText = (filePath: string) => {
    const cached = fileTextCache.get(filePath);
    if (cached != null) return cached;
    const text = readFileSync(filePath, "utf8");
    fileTextCache.set(filePath, text);
    return text;
  };

  const getNonCodeRanges = (filePath: string) => {
    const cached = nonCodeCache.get(filePath);
    if (cached) return cached;
    const ranges = collectNonCodeRanges(getFileText(filePath), filePath);
    nonCodeCache.set(filePath, ranges);
    return ranges;
  };

  for (const m of matches) {
    const filePath = m.filePath;
    const fileText = getFileText(filePath);
    const nonCodeRanges = getNonCodeRanges(filePath);

    const sub = m.submatches[submatch];
    if (!sub) {
      candidates.push({
        filePath,
        line: m.line,
        preview: m.preview,
        error: `No submatch ${submatch} (available: ${m.submatches.length})`,
      });
      continue;
    }

    let targetByteOffsetInSub = 0;
    if (target) {
      const buf = Buffer.from(sub.text, "utf8");
      const needle = Buffer.from(target, "utf8");
      const first = buf.indexOf(needle);
      const second = first === -1 ? -1 : buf.indexOf(needle, first + 1);
      if (first === -1) {
        candidates.push({
          filePath,
          line: m.line,
          preview: m.preview,
          error: `Target not found in match: ${target}`,
        });
        continue;
      }
      if (second !== -1) {
        candidates.push({
          filePath,
          line: m.line,
          preview: m.preview,
          error: `Target occurs multiple times in match; refine --regex or --target`,
        });
        continue;
      }
      targetByteOffsetInSub = first;
    }

    const absByteOffset = m.matchByteOffset + sub.startByte + targetByteOffsetInSub;
    const pos = byteOffsetToUtf16Pos(fileText, absByteOffset);

    if (isPosInNonCode(pos, nonCodeRanges)) {
      // Ignore matches inside comments/strings/regex/JSX text.
      continue;
    }

    // Keep original line from rg when possible.
    items.push({ filePath, pos, preview: m.preview, line: m.line });
  }

  const { engine, lspEndpoint } = resolveEngine(parsed.flags);
  const batch = await engineBatchAt({
    engine,
    lspEndpoint,
    cwd: params.cwd,
    projectFlag,
    items,
    expand,
    depth,
    maxProps,
    maxUnion,
    maxChars,
  });

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const r = batch.results[i]!;
    if (r.status === "ok") {
      candidates.push(r.result);
      continue;
    }
    const fileText = getFileText(it.filePath);
    const lc = utf16PosToLineChar1Based(fileText, it.pos);
    if (r.status === "noQuickInfo") {
      candidates.push({
        filePath: it.filePath,
        line: it.line ?? lc.line,
        character: lc.character,
        pos: it.pos,
        preview: it.preview,
        error: "No QuickInfo at candidate position",
      });
      continue;
    }
    candidates.push({
      filePath: it.filePath,
      line: it.line ?? lc.line,
      character: lc.character,
      pos: it.pos,
      preview: it.preview,
      error: r.message,
    });
  }

  const out = {
    regex,
    root,
    candidates,
  };

  process.stdout.write(json ? formatGrepJson(out) : formatGrepHuman(out));

  const okCount = candidates.filter((c) => !c.error).length;
  if (okCount === 1) return 0;
  return okCount === 0 ? 2 : 3;
}
