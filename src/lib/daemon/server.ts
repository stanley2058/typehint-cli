import fs from "node:fs";
import net from "node:net";
import process from "node:process";

import {
  computeTypehintAt,
  type ComputeAtParams,
} from "../typehint/compute.ts";
import { createIncrementalTsContext } from "../ts/incremental.ts";
import { createJsonLineParser, type RpcRequest, writeJsonLine } from "./rpc.ts";

export async function runTypehintServer(params: {
  cwd: string;
  projectFlag?: string;
  socketPath: string;
  idleMs: number;
}): Promise<void> {
  // One project per server process.
  const ctx = createIncrementalTsContext({
    cwd: params.cwd,
    project: params.projectFlag,
  });

  try {
    if (fs.existsSync(params.socketPath)) fs.unlinkSync(params.socketPath);
  } catch {
    // ignore
  }

  let idleTimer: any;
  function resetIdleTimer() {
    if (params.idleMs <= 0) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try {
        server.close();
      } catch {
        // ignore
      }
      process.exit(0);
    }, params.idleMs);
  }

  const server = net.createServer((sock) => {
    resetIdleTimer();
    sock.setEncoding("utf8");

    const onData = createJsonLineParser(async (obj) => {
      resetIdleTimer();
      const req = obj as RpcRequest;
      if (
        !req ||
        typeof req !== "object" ||
        typeof req.id !== "string" ||
        typeof req.method !== "string"
      )
        return;

      try {
        if (req.method === "typehint/ping") {
          writeJsonLine(sock, { id: req.id, result: { ok: true } });
          return;
        }

        if (req.method === "typehint/at") {
          const p = req.params ?? {};
          if (p.filePath) ctx.addExtraFile(String(p.filePath));
          const out = computeTypehintAt(ctx, normalizeAtParams(p));
          writeJsonLine(sock, { id: req.id, result: out });
          return;
        }

        if (req.method === "typehint/batchAt") {
          const p = req.params ?? {};
          const items = Array.isArray(p.items) ? p.items : [];
          const opts = p.options ?? {};
          for (const it of items) {
            if (it?.filePath) ctx.addExtraFile(String(it.filePath));
          }
          const results = items.map((it: any) => {
            const merged = {
              filePath: String(it.filePath ?? ""),
              pos: Number(it.pos ?? 0),
              preview: it.preview != null ? String(it.preview) : undefined,
              line: it.line != null ? Number(it.line) : undefined,
              expand: Boolean(opts.expand ?? true),
              depth: Number(opts.depth ?? 2),
              maxProps: Number(opts.maxProps ?? 50),
              maxUnion: Number(opts.maxUnion ?? 10),
              maxChars: Number(opts.maxChars ?? 4000),
            } satisfies ComputeAtParams;
            return computeTypehintAt(ctx, merged);
          });
          writeJsonLine(sock, { id: req.id, result: { results } });
          return;
        }

        writeJsonLine(sock, {
          id: req.id,
          error: { message: `Unknown method: ${req.method}` },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        writeJsonLine(sock, { id: req.id, error: { message: msg, stack } });
      }
    });

    sock.on("data", onData);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(params.socketPath, () => resolve());
  });

  resetIdleTimer();

  await new Promise<void>((resolve) => {
    server.once("close", () => resolve());
  });
}

function normalizeAtParams(p: any): ComputeAtParams {
  return {
    filePath: String(p.filePath ?? ""),
    pos: Number(p.pos ?? 0),
    preview: p.preview != null ? String(p.preview) : undefined,
    line: p.line != null ? Number(p.line) : undefined,
    expand: Boolean(p.expand ?? true),
    depth: Number(p.depth ?? 2),
    maxProps: Number(p.maxProps ?? 50),
    maxUnion: Number(p.maxUnion ?? 10),
    maxChars: Number(p.maxChars ?? 4000),
  };
}
