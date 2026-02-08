import fs from "node:fs";
import path from "node:path";

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function findUp(startDir: string, fileName: string): string | undefined {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, fileName);
    if (existsFile(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function findUpTsconfig(params: {
  cwd: string;
  project?: string;
  extraFile?: string;
}): string {
  if (params.project) {
    const p = path.isAbsolute(params.project) ? params.project : path.resolve(params.cwd, params.project);
    if (isDirectory(p)) {
      const found = findUp(p, "tsconfig.json") ?? path.join(p, "tsconfig.json");
      if (!existsFile(found)) throw new Error(`tsconfig.json not found in directory: ${p}`);
      return found;
    }
    if (!existsFile(p)) throw new Error(`tsconfig.json not found: ${p}`);
    return p;
  }

  const start = params.extraFile
    ? path.dirname(path.isAbsolute(params.extraFile) ? params.extraFile : path.resolve(params.cwd, params.extraFile))
    : params.cwd;

  const found = findUp(start, "tsconfig.json") ?? findUp(params.cwd, "tsconfig.json");
  if (!found) throw new Error(`tsconfig.json not found (start: ${start})`);
  return found;
}
