import { spawn } from "node:child_process";
import path from "node:path";

export type RgSubmatch = {
  text: string;
  startByte: number;
  endByte: number;
};

export type RgMatch = {
  filePath: string;
  line: number;
  preview: string;
  matchByteOffset: number;
  submatches: RgSubmatch[];
};

export async function rgSearch(params: {
  regex: string;
  root: string;
  globs?: string[];
  maxMatches: number;
  includeNodeModules: boolean;
}): Promise<RgMatch[]> {
  const args: string[] = [
    "--json",
    "-n",
    "--regexp",
    params.regex,
  ];

  const globs = params.globs ?? [];
  for (const g of globs) args.push("--glob", g);

  if (!params.includeNodeModules) {
    args.push("--glob", "!**/node_modules/**");
    args.push("--glob", "!**/.git/**");
  }

  args.push(params.root);

  const child = spawn("rg", args, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: params.root,
    env: process.env,
  });

  const matches: RgMatch[] = [];
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    stderr += d;
  });

  child.stdout.setEncoding("utf8");

  let buf = "";
  const done = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });

  child.stdout.on("data", (chunk) => {
    buf += chunk;
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) break;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);

      if (!line.trim()) continue;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type !== "match") continue;

      const data = ev.data;
      const filePath: string = data.path.text;
      const lineNumber: number = data.line_number;
      const preview: string = String(data.lines.text ?? "").replace(/\n$/, "");
      const matchByteOffset: number = data.absolute_offset;
      const submatches: RgSubmatch[] = (data.submatches ?? []).map((s: any) => ({
        text: String(s.match.text ?? ""),
        startByte: Number(s.start ?? 0),
        endByte: Number(s.end ?? 0),
      }));

      matches.push({
        filePath: path.isAbsolute(filePath) ? filePath : path.resolve(params.root, filePath),
        line: lineNumber,
        preview,
        matchByteOffset,
        submatches,
      });

      if (matches.length >= params.maxMatches) {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        break;
      }
    }
  });

  const code = await done;
  // ripgrep exit codes:
  // - 0: matches found
  // - 1: no matches
  // - 2+: actual errors
  if (code === 1 && matches.length === 0) {
    return [];
  }
  if (code !== 0 && matches.length === 0) {
    const msg = stderr.trim() || `ripgrep failed with exit code ${code}`;
    throw new Error(msg);
  }

  return matches;
}
