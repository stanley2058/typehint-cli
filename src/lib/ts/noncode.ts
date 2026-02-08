import ts from "typescript";
import path from "node:path";

export type NonCodeRange = { start: number; end: number };

function languageVariantFromFilePath(filePath: string): ts.LanguageVariant {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx" || ext === ".jsx") return ts.LanguageVariant.JSX;
  return ts.LanguageVariant.Standard;
}

function isNonCodeTokenKind(kind: ts.SyntaxKind): boolean {
  switch (kind) {
    case ts.SyntaxKind.SingleLineCommentTrivia:
    case ts.SyntaxKind.MultiLineCommentTrivia:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.JsxText:
    case ts.SyntaxKind.JsxTextAllWhiteSpaces:
      return true;
    default:
      return false;
  }
}

export function collectNonCodeRanges(
  fileText: string,
  filePath: string,
): NonCodeRange[] {
  const ranges: NonCodeRange[] = [];

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    languageVariantFromFilePath(filePath),
    fileText,
  );

  while (true) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;

    if (!isNonCodeTokenKind(kind)) continue;
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    if (end > start) ranges.push({ start, end });
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  // Merge overlaps.
  const merged: NonCodeRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) {
      merged.push({ start: r.start, end: r.end });
      continue;
    }
    if (r.end > last.end) last.end = r.end;
  }

  return merged;
}

export function isPosInNonCode(pos: number, ranges: NonCodeRange[]): boolean {
  // Binary search.
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid]!;
    if (pos < r.start) {
      hi = mid - 1;
      continue;
    }
    if (pos >= r.end) {
      lo = mid + 1;
      continue;
    }
    return true;
  }
  return false;
}
