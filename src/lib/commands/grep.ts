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
import { createTsContext } from "../ts/project.ts";
import { rgSearch } from "../search/rg.ts";
import { byteOffsetToUtf16Pos } from "../util/utf8.ts";
import { getNodeForHover } from "../ts/position.ts";
import { expandTypeBounded } from "../ts/expand.ts";
import { collectNonCodeRanges, isPosInNonCode } from "../ts/noncode.ts";

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

  const files = Array.from(new Set(matches.map((m) => m.filePath)));
  const ctx = await createTsContext({
    cwd: params.cwd,
    project: projectFlag,
    extraFileNames: files,
  });
  const program = ctx.languageService.getProgram();
  if (!program) throw new Error("TypeScript program is unavailable");
  const checker = program.getTypeChecker();

  const candidates: any[] = [];

  const matchesByFile = new Map<string, typeof matches>();
  for (const m of matches) {
    const list = matchesByFile.get(m.filePath);
    if (list) list.push(m);
    else matchesByFile.set(m.filePath, [m]);
  }

  for (const [filePath, fileMatches] of matchesByFile) {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) continue;

    const fileText = ctx.readFileText(filePath);
    const nonCodeRanges = collectNonCodeRanges(fileText, filePath);

    for (const m of fileMatches) {

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

      const lc = sourceFile.getLineAndCharacterOfPosition(pos);
      const line1 = lc.line + 1;
      const char1 = lc.character + 1;

      const qi = ctx.languageService.getQuickInfoAtPosition(filePath, pos);
      if (!qi) {
        candidates.push({
          filePath,
          line: line1,
          character: char1,
          pos,
          preview: m.preview,
          error: "No QuickInfo at candidate position",
        });
        continue;
      }

      const hoverNode = getNodeForHover(sourceFile, pos);
      const symbol = checker.getSymbolAtLocation(hoverNode) ?? undefined;
      const type = symbol
        ? checker.getTypeOfSymbolAtLocation(symbol, hoverNode)
        : checker.getTypeAtLocation(hoverNode);

      const expandedType = expand
        ? expandTypeBounded(checker, type, hoverNode, {
            depth,
            maxProps,
            maxUnion,
            maxChars,
          })
        : undefined;

      candidates.push(
        ctx.formatResult({
          filePath,
          sourceFile,
          pos,
          quickInfo: qi,
          expandedType,
          preview: m.preview,
          line: line1,
        }),
      );
    }
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
