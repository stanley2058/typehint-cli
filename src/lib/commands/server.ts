import process from "node:process";

import { getFlagNumber, getFlagString, parseArgs } from "../args.ts";
import { runTypehintServer } from "../daemon/server.ts";

export async function typehintServer(params: { argv: string[]; cwd: string }): Promise<number> {
  const parsed = parseArgs(params.argv);
  const socketPath = getFlagString(parsed.flags, "socket");
  if (!socketPath) {
    process.stderr.write("Missing required flag: --socket\n");
    return 1;
  }

  const projectFlag = getFlagString(parsed.flags, "project") ?? getFlagString(parsed.flags, "p");
  const idleMs = getFlagNumber(parsed.flags, "idleMs", {
    defaultValue: Number(process.env.TYPEHINT_DAEMON_IDLE_MS ?? "300000"),
    min: 0,
  });

  await runTypehintServer({
    cwd: params.cwd,
    projectFlag,
    socketPath,
    idleMs,
  });

  return 0;
}
