import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export function socketPathForProject(projectPath: string): string {
  const h = crypto.createHash("sha1").update(projectPath).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `typehint-${h}.sock`);
}
