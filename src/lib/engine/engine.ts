import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createTsContext } from "../ts/project.ts";
import {
  computeTypehintAt,
  type ComputeAtOutput,
} from "../typehint/compute.ts";
import { requestDaemonJson } from "../daemon/client.ts";

export type EngineKind = "auto" | "daemon" | "local" | "lsp";

export function resolveEngine(flags: Record<string, any>): {
  engine: EngineKind;
  lspEndpoint?: string;
} {
  const envEngine = (process.env.TYPEHINT_ENGINE ?? "").trim();
  const flagEngine =
    typeof flags.engine === "string" ? String(flags.engine) : undefined;
  const raw = (flagEngine ?? envEngine ?? "auto").toLowerCase();
  const engine: EngineKind =
    raw === "daemon" || raw === "local" || raw === "lsp" ? raw : "auto";

  const lspEndpoint =
    (typeof flags.lsp === "string" ? String(flags.lsp) : undefined) ??
    (process.env.TYPEHINT_LSP_ENDPOINT
      ? String(process.env.TYPEHINT_LSP_ENDPOINT)
      : undefined);

  return { engine, lspEndpoint };
}

export async function engineAt(params: {
  engine: EngineKind;
  lspEndpoint?: string;
  cwd: string;
  projectFlag?: string;
  filePath: string;
  pos: number;
  preview?: string;
  line?: number;
  expand: boolean;
  depth: number;
  maxProps: number;
  maxUnion: number;
  maxChars: number;
}): Promise<ComputeAtOutput> {
  if (params.engine === "local") {
    const ctx = await createTsContext({
      cwd: params.cwd,
      project: params.projectFlag,
      extraFileNames: [params.filePath],
    });
    return computeTypehintAt(ctx, {
      filePath: params.filePath,
      pos: params.pos,
      preview: params.preview,
      line: params.line,
      expand: params.expand,
      depth: params.depth,
      maxProps: params.maxProps,
      maxUnion: params.maxUnion,
      maxChars: params.maxChars,
    });
  }

  const wantsLspFirst = params.engine === "lsp" || params.engine === "auto";
  const wantsDaemon = params.engine === "daemon" || params.engine === "auto";

  if (wantsLspFirst && params.lspEndpoint) {
    try {
      const res = await requestDaemonJson({
        cwd: params.cwd,
        projectFlag: params.projectFlag,
        extraFile: params.filePath,
        method: "typehint/at",
        requestParams: {
          filePath: params.filePath,
          pos: params.pos,
          preview: params.preview,
          line: params.line,
          expand: params.expand,
          depth: params.depth,
          maxProps: params.maxProps,
          maxUnion: params.maxUnion,
          maxChars: params.maxChars,
        },
        lspEndpoint: params.lspEndpoint,
      });
      return res as ComputeAtOutput;
    } catch {
      if (params.engine === "lsp")
        throw new Error("Failed to query workspace LSP endpoint");
      // fall through to daemon
    }
  }

  if (wantsDaemon) {
    const res = await requestDaemonJson({
      cwd: params.cwd,
      projectFlag: params.projectFlag,
      extraFile: params.filePath,
      method: "typehint/at",
      requestParams: {
        filePath: params.filePath,
        pos: params.pos,
        preview: params.preview,
        line: params.line,
        expand: params.expand,
        depth: params.depth,
        maxProps: params.maxProps,
        maxUnion: params.maxUnion,
        maxChars: params.maxChars,
      },
    });
    return res as ComputeAtOutput;
  }

  // Fallback: if the engine selection was weird, do local.
  const ctx = await createTsContext({
    cwd: params.cwd,
    project: params.projectFlag,
    extraFileNames: [params.filePath],
  });
  return computeTypehintAt(ctx, {
    filePath: params.filePath,
    pos: params.pos,
    preview: params.preview,
    line: params.line,
    expand: params.expand,
    depth: params.depth,
    maxProps: params.maxProps,
    maxUnion: params.maxUnion,
    maxChars: params.maxChars,
  });
}

export async function engineBatchAt(params: {
  engine: EngineKind;
  lspEndpoint?: string;
  cwd: string;
  projectFlag?: string;
  items: Array<{
    filePath: string;
    pos: number;
    preview?: string;
    line?: number;
  }>;
  expand: boolean;
  depth: number;
  maxProps: number;
  maxUnion: number;
  maxChars: number;
}): Promise<{ results: ComputeAtOutput[] }> {
  if (params.engine === "local") {
    const extra = Array.from(new Set(params.items.map((i) => i.filePath)));
    const ctx = await createTsContext({
      cwd: params.cwd,
      project: params.projectFlag,
      extraFileNames: extra,
    });
    const results = params.items.map((it) =>
      computeTypehintAt(ctx, {
        filePath: it.filePath,
        pos: it.pos,
        preview: it.preview,
        line: it.line,
        expand: params.expand,
        depth: params.depth,
        maxProps: params.maxProps,
        maxUnion: params.maxUnion,
        maxChars: params.maxChars,
      }),
    );
    return { results };
  }

  const wantsLspFirst = params.engine === "lsp" || params.engine === "auto";
  const wantsDaemon = params.engine === "daemon" || params.engine === "auto";

  if (wantsLspFirst && params.lspEndpoint) {
    try {
      const res = await requestDaemonJson({
        cwd: params.cwd,
        projectFlag: params.projectFlag,
        extraFile: params.items[0]?.filePath,
        method: "typehint/batchAt",
        requestParams: {
          items: params.items,
          options: {
            expand: params.expand,
            depth: params.depth,
            maxProps: params.maxProps,
            maxUnion: params.maxUnion,
            maxChars: params.maxChars,
          },
        },
        lspEndpoint: params.lspEndpoint,
      });
      return res as { results: ComputeAtOutput[] };
    } catch {
      if (params.engine === "lsp")
        throw new Error("Failed to query workspace LSP endpoint");
    }
  }

  if (wantsDaemon) {
    const res = await requestDaemonJson({
      cwd: params.cwd,
      projectFlag: params.projectFlag,
      extraFile: params.items[0]?.filePath,
      method: "typehint/batchAt",
      requestParams: {
        items: params.items,
        options: {
          expand: params.expand,
          depth: params.depth,
          maxProps: params.maxProps,
          maxUnion: params.maxUnion,
          maxChars: params.maxChars,
        },
      },
    });
    return res as { results: ComputeAtOutput[] };
  }

  return await engineBatchAt({
    ...params,
    engine: "local",
  });
}

export function readFileTextFast(filePath: string): string {
  // Prefer sync: only used for mapping line/char to pos.
  return fs.readFileSync(filePath, "utf8");
}

export function normalizeAbs(cwd: string, fileFlag: string): string {
  return path.isAbsolute(fileFlag) ? fileFlag : path.resolve(cwd, fileFlag);
}
