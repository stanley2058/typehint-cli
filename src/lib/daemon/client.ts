import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import childProcess from "node:child_process";

import {
  createJsonLineParser,
  type RpcRequest,
  type RpcResponse,
  writeJsonLine,
} from "./rpc.ts";
import { socketPathForProject } from "./paths.ts";
import { findUpTsconfig } from "../util/tsconfig.ts";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type DaemonClientOptions = {
  cwd: string;
  projectFlag?: string;
  extraFile?: string;
  lspEndpoint?: string;
};

export function resolveProjectPathForRequest(
  opts: DaemonClientOptions,
): string {
  return findUpTsconfig({
    cwd: opts.cwd,
    project: opts.projectFlag,
    extraFile: opts.extraFile,
  });
}

function parseEndpoint(
  endpoint: string,
):
  | { kind: "unix"; socketPath: string }
  | { kind: "tcp"; host: string; port: number } {
  if (endpoint.startsWith("unix:"))
    return { kind: "unix", socketPath: endpoint.slice("unix:".length) };
  if (endpoint.startsWith("tcp:")) {
    const rest = endpoint.slice("tcp:".length);
    const [host, portStr] = rest.split(":");
    const port = Number(portStr);
    if (!host || !Number.isFinite(port))
      throw new Error(`Invalid tcp endpoint: ${endpoint}`);
    return { kind: "tcp", host, port };
  }
  // Back-compat: plain path means unix socket.
  return { kind: "unix", socketPath: endpoint };
}

async function connectOnce(params: { endpoint: string }): Promise<net.Socket> {
  const ep = parseEndpoint(params.endpoint);
  return await new Promise((resolve, reject) => {
    const sock = net.createConnection(
      ep.kind === "unix"
        ? { path: ep.socketPath }
        : { host: ep.host, port: ep.port },
      () => resolve(sock),
    );
    sock.on("error", reject);
  });
}

function removeStaleUnixSocket(endpoint: string) {
  const ep = parseEndpoint(endpoint);
  if (ep.kind !== "unix") return;
  try {
    if (fs.existsSync(ep.socketPath)) fs.unlinkSync(ep.socketPath);
  } catch {
    // ignore
  }
}

function spawnServer(params: {
  projectPath: string;
  endpoint: string;
  cwd: string;
}) {
  const ep = parseEndpoint(params.endpoint);
  if (ep.kind !== "unix") {
    throw new Error("Auto-spawn only supports unix sockets currently");
  }

  const argv0 = process.argv[0] ?? "bun";
  const argv1 = process.argv[1] ?? path.resolve("src/cli.ts");
  const child = childProcess.spawn(
    argv0,
    [
      argv1,
      "server",
      "--project",
      params.projectPath,
      "--socket",
      ep.socketPath,
    ],
    {
      cwd: params.cwd,
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref?.();
}

let nextId = 1;

export async function requestDaemonJson(params: {
  cwd: string;
  projectFlag?: string;
  extraFile?: string;
  method: string;
  requestParams: any;
  // If provided, try this first (treat as workspace LSP).
  lspEndpoint?: string;
}): Promise<any> {
  const projectPath = resolveProjectPathForRequest({
    cwd: params.cwd,
    projectFlag: params.projectFlag,
    extraFile: params.extraFile,
  });

  const preferredEndpoint =
    params.lspEndpoint || process.env.TYPEHINT_LSP_ENDPOINT || "";

  const daemonEndpoint = `unix:${socketPathForProject(projectPath)}`;

  const endpoints = preferredEndpoint
    ? [preferredEndpoint, daemonEndpoint]
    : [daemonEndpoint];

  let lastErr: unknown;
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i]!;
    try {
      const sock = await connectOnce({ endpoint });
      try {
        const out = await rpcRoundTrip(sock, {
          id: String(nextId++),
          method: params.method,
          params: {
            projectPath,
            ...params.requestParams,
          },
        });
        sock.end();
        return out;
      } finally {
        try {
          sock.destroy();
        } catch {
          // ignore
        }
      }
    } catch (err) {
      lastErr = err;
      // If this is the daemon endpoint, try to spawn then retry once.
      if (endpoint === daemonEndpoint) {
        // Handle stale socket file.
        removeStaleUnixSocket(endpoint);
        try {
          spawnServer({ projectPath, endpoint, cwd: params.cwd });
        } catch (spawnErr) {
          lastErr = spawnErr;
          continue;
        }
        // Wait for server to come up.
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            const sock = await connectOnce({ endpoint });
            const out = await rpcRoundTrip(sock, {
              id: String(nextId++),
              method: params.method,
              params: { projectPath, ...params.requestParams },
            });
            sock.end();
            return out;
          } catch (e2) {
            lastErr = e2;
            await sleep(25);
          }
        }
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function rpcRoundTrip(sock: net.Socket, req: RpcRequest): Promise<any> {
  return await new Promise((resolve, reject) => {
    const onData = createJsonLineParser((obj) => {
      const res = obj as RpcResponse;
      if (!res || typeof res !== "object" || res.id !== req.id) return;
      cleanup();
      if (res.error) {
        const e = new Error(res.error.message, { cause: res.error });
        reject(e);
        return;
      }
      resolve(res.result);
    });

    const onErr = (e: any) => {
      cleanup();
      reject(e);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("connection closed"));
    };

    function cleanup() {
      sock.off("error", onErr);
      sock.off("close", onClose);
      sock.off("end", onClose);
      sock.off("data", onData);
    }

    sock.setEncoding("utf8");
    sock.on("data", onData);
    sock.on("error", onErr);
    sock.on("close", onClose);
    sock.on("end", onClose);

    writeJsonLine(sock, req);
  });
}
