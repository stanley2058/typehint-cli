import { expandTypeBounded } from "../ts/expand.ts";
import { getNodeForHover } from "../ts/position.ts";
import type { TsContext } from "../ts/project.ts";
import type { TypehintResult } from "../output.ts";

export type ComputeAtParams = {
  filePath: string;
  pos: number;
  preview?: string;
  line?: number;
  expand: boolean;
  depth: number;
  maxProps: number;
  maxUnion: number;
  maxChars: number;
};

export type ComputeAtOutput =
  | { status: "ok"; result: TypehintResult }
  | { status: "noQuickInfo" }
  | { status: "error"; message: string };

export function computeTypehintAt(ctx: TsContext, params: ComputeAtParams): ComputeAtOutput {
  try {
    const program = ctx.languageService.getProgram();
    if (!program) return { status: "error", message: "TypeScript program is unavailable" };

    const sourceFile = program.getSourceFile(params.filePath);
    if (!sourceFile) {
      return { status: "error", message: `File is not in program: ${params.filePath}` };
    }

    const qi = ctx.languageService.getQuickInfoAtPosition(params.filePath, params.pos);
    if (!qi) return { status: "noQuickInfo" };

    const checker = program.getTypeChecker();
    const hoverNode = getNodeForHover(sourceFile, params.pos);
    const symbol = checker.getSymbolAtLocation(hoverNode) ?? undefined;
    const type = symbol
      ? checker.getTypeOfSymbolAtLocation(symbol, hoverNode)
      : checker.getTypeAtLocation(hoverNode);

    const expandedType = params.expand
      ? expandTypeBounded(checker, type, hoverNode, {
          depth: params.depth,
          maxProps: params.maxProps,
          maxUnion: params.maxUnion,
          maxChars: params.maxChars,
        })
      : undefined;

    const result = ctx.formatResult({
      filePath: params.filePath,
      sourceFile,
      pos: params.pos,
      quickInfo: qi,
      expandedType,
      preview: params.preview,
      line: params.line,
    });

    return { status: "ok", result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", message: msg };
  }
}
