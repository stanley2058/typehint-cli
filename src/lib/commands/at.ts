import process from "node:process";

import {
  getFlagBoolean,
  getFlagNumber,
  getFlagString,
  parseArgs,
} from "../args.ts";
import { formatHuman, formatJson } from "../output.ts";
import { resolveEngine, engineAt, normalizeAbs, readFileTextFast } from "../engine/engine.ts";
import { lineChar1BasedToUtf16Pos } from "../util/linepos.ts";

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

  const filePath = normalizeAbs(params.cwd, fileFlag);

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

  const posNumber =
    pos0Based != null
      ? pos0Based
      : lineChar1BasedToUtf16Pos(readFileTextFast(filePath), lineChar1Based!.line, lineChar1Based!.character);

  const { engine, lspEndpoint } = resolveEngine(parsed.flags);

  const out = await engineAt({
    engine,
    lspEndpoint,
    cwd: params.cwd,
    projectFlag,
    filePath,
    pos: posNumber,
    expand,
    depth,
    maxProps,
    maxUnion,
    maxChars,
  });

  if (out.status === "noQuickInfo") {
    process.stderr.write("No QuickInfo at the given position\n");
    return 2;
  }
  if (out.status === "error") {
    process.stderr.write(`${out.message}\n`);
    return 1;
  }

  if (json) process.stdout.write(formatJson(out.result));
  else process.stdout.write(formatHuman(out.result));
  return 0;
}
