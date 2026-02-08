import ts from "typescript";

export type TypehintResult = {
  filePath: string;
  line: number;
  character: number;
  pos: number;
  preview?: string;
  kind?: string;
  kindModifiers?: string;
  display: string;
  documentation?: string;
  tags?: Array<{ name: string; text?: string }>;
  deprecated?: boolean;
  deprecatedText?: string;
  expandedType?: string;
  error?: string;
};

export function formatHuman(r: TypehintResult): string {
  const loc = `${r.filePath}:${r.line}:${r.character}`;
  const parts: string[] = [];
  parts.push(loc);
  if (r.preview) parts.push(r.preview.trimEnd());
  parts.push(r.display);
  if (r.deprecated) {
    parts.push(
      r.deprecatedText ? `deprecated: ${r.deprecatedText}` : "deprecated: true",
    );
  }
  if (r.documentation) parts.push(r.documentation.trim());
  if (r.expandedType) parts.push(`expanded: ${r.expandedType}`);
  return parts.join("\n") + "\n";
}

export function formatJson(r: TypehintResult): string {
  return JSON.stringify(r, null, 2) + "\n";
}

export function formatGrepHuman(out: any): string {
  const cands = out.candidates ?? [];
  if (cands.length === 0) {
    return `No matches\n`;
  }
  if (cands.length === 1 && !cands[0].error) {
    return formatHuman(cands[0]);
  }

  const lines: string[] = [];
  lines.push(`Found ${cands.length} candidates:`);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const loc = c.line && c.character ? `${c.filePath}:${c.line}:${c.character}` : `${c.filePath}:${c.line}`;
    lines.push(`- [${i}] ${loc}${c.error ? ` (error: ${c.error})` : ""}`);
    if (c.preview) lines.push(`  ${String(c.preview).trimEnd()}`);
    if (c.display) lines.push(`  ${String(c.display).trimEnd()}`);
    if (c.expandedType) lines.push(`  expanded: ${String(c.expandedType).trimEnd()}`);
  }
  lines.push("");
  lines.push("Refine your --regex/--target or use 'at' with an exact location.");
  return lines.join("\n") + "\n";
}

export function formatGrepJson(out: any): string {
  return JSON.stringify(out, null, 2) + "\n";
}

export function quickInfoToDisplay(qi: ts.QuickInfo): string {
  return ts.displayPartsToString(qi.displayParts ?? []);
}
