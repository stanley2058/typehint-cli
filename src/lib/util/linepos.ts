export function lineChar1BasedToUtf16Pos(fileText: string, line1: number, char1: number): number {
  if (line1 < 1 || char1 < 1) throw new Error("line/char must be 1-based");

  let line = 1;
  let i = 0;
  while (line < line1) {
    const nl = fileText.indexOf("\n", i);
    if (nl === -1) {
      // Line beyond EOF: clamp to end.
      return fileText.length;
    }
    i = nl + 1;
    line++;
  }

  // Now at start of requested line.
  // char1 is 1-based UTF-16 code unit offset within the line.
  const pos = i + (char1 - 1);
  return Math.max(0, Math.min(pos, fileText.length));
}

export function utf16PosToLineChar1Based(fileText: string, pos: number): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(pos, fileText.length));
  let line = 1;
  let lastLineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (fileText.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastLineStart = i + 1;
    }
  }
  return { line, character: clamped - lastLineStart + 1 };
}
