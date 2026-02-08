export function byteOffsetToUtf16Pos(fileText: string, byteOffset: number): number {
  const buf = Buffer.from(fileText, "utf8");
  const clamped = Math.max(0, Math.min(byteOffset, buf.length));
  const prefix = buf.toString("utf8", 0, clamped);
  return prefix.length;
}
