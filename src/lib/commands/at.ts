import path from "node:path";
import process from "node:process";

import {
  getFlagBoolean,
  getFlagNumber,
  getFlagString,
  parseArgs,
} from "../args.ts";
import { formatHuman, formatJson } from "../output.ts";
import { createTsContext } from "../ts/project.ts";
import { getNodeForHover, posFromLineChar } from "../ts/position.ts";
import { expandTypeBounded } from "../ts/expand.ts";

export type TypehintAtParams = {
  argv: string[];
  cwd: string;
};

export async function typehintAt(params: TypehintAtParams): Promise<number> {
  const parsed = parseArgs(params.argv);

  if (parsed.flags.help === true || parsed.flags.h === true) {
    process.stdout.write("Run: typehint --help\n");
    return 0;
  }

  const fileFlag = getFlagString(parsed.flags, "file") ?? getFlagString(parsed.flags, "f");
  if (!fileFlag) {
    process.stderr.write("Missing required flag: --file\n");
    return 1;
  }

  const filePath = path.isAbsolute(fileFlag) ? fileFlag : path.resolve(params.cwd, fileFlag);

  const posFlag = getFlagString(parsed.flags, "pos");
  const lineFlag = getFlagString(parsed.flags, "line");
  const charFlag = getFlagString(parsed.flags, "char") ?? getFlagString(parsed.flags, "column");

  let pos0Based: number | undefined;
  let lineChar1Based: { line: number; character: number } | undefined;
  if (posFlag != null) {
    const n = Number(posFlag);
    if (!Number.isFinite(n) || n < 0) {
      process.stderr.write("Invalid --pos; expected a non-negative integer\n");
      return 1;
    }
    pos0Based = Math.trunc(n);
  } else if (lineFlag != null || charFlag != null) {
    if (lineFlag == null || charFlag == null) {
      process.stderr.write("--line and --char must be provided together\n");
      return 1;
    }
    const line = Number(lineFlag);
    const ch = Number(charFlag);
    if (!Number.isFinite(line) || !Number.isFinite(ch) || line < 1 || ch < 1) {
      process.stderr.write("Invalid --line/--char; expected 1-based integers\n");
      return 1;
    }
    lineChar1Based = { line: Math.trunc(line), character: Math.trunc(ch) };
  } else {
    process.stderr.write("Missing position; provide --pos or --line/--char\n");
    return 1;
  }

  const projectFlag = getFlagString(parsed.flags, "project") ?? getFlagString(parsed.flags, "p");
  const json = parsed.flags.json === true;

  const expand = getFlagBoolean(parsed.flags, "expand", true);
  const depth = getFlagNumber(parsed.flags, "depth", { defaultValue: 2, min: 0 });
  const maxProps = getFlagNumber(parsed.flags, "maxProps", { defaultValue: 50, min: 0 });
  const maxUnion = getFlagNumber(parsed.flags, "maxUnion", { defaultValue: 10, min: 0 });
  const maxChars = getFlagNumber(parsed.flags, "maxChars", { defaultValue: 4000, min: 200 });

  const ctx = await createTsContext({
    cwd: params.cwd,
    project: projectFlag,
    extraFileNames: [filePath],
  });

  const program = ctx.languageService.getProgram();
  if (!program) throw new Error("TypeScript program is unavailable");

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`File is not in program: ${filePath}`);
  }

  const posNumber =
    pos0Based != null
      ? pos0Based
      : posFromLineChar(sourceFile, lineChar1Based!.line, lineChar1Based!.character);

  const qi = ctx.languageService.getQuickInfoAtPosition(filePath, posNumber);
  if (!qi) {
    process.stderr.write("No QuickInfo at the given position\n");
    return 2;
  }

  const checker = program.getTypeChecker();
  const hoverNode = getNodeForHover(sourceFile, posNumber);
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

  const result = ctx.formatResult({
    filePath,
    sourceFile,
    pos: posNumber,
    quickInfo: qi,
    expandedType,
  });

  if (json) {
    process.stdout.write(formatJson(result));
  } else {
    process.stdout.write(formatHuman(result));
  }

  return 0;
}
