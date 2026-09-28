import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export function socketPathForProject(projectPath: string): string {
  // Key on version so an upgraded CLI never talks to a daemon still running old code,
  // and on uid so users sharing /tmp don't connect to each other's daemons.
  const uid = typeof process.getuid === "function" ? process.getuid() : os.userInfo().username;
  const h = crypto
    .createHash("sha1")
    .update(`${PACKAGE_VERSION}\0${uid}\0${projectPath}`)
    .digest("hex")
    .slice(0, 16);
  if (process.platform === "win32") return `\\\\.\\pipe\\typehint-${h}`;
  const dir = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(dir, `typehint-${h}.sock`);
}
