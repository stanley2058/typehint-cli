import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { quickInfoToDisplay, type TypehintResult } from "../output.ts";
import { findUpTsconfig } from "../util/tsconfig.ts";
import { posToLineChar1Based } from "./position.ts";
import { type TsContext } from "./project.ts";

type FileRecord = {
  version: number;
  mtimeMs: number;
  pendingReload: boolean;
  text?: string;
  snapshot?: ts.IScriptSnapshot;
};

export type IncrementalTsContext = TsContext & {
  addExtraFile: (filePath: string) => void;
};

export function createIncrementalTsContext(params: {
  cwd: string;
  project?: string;
  extraFileNames?: string[];
}): IncrementalTsContext {
  const projectPath = findUpTsconfig({ cwd: params.cwd, project: params.project, extraFile: params.extraFileNames?.[0] });

  const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext([configFile.error], {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => params.cwd,
        getNewLine: () => "\n",
      }),
    );
  }

  const configDir = path.dirname(projectPath);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    configDir,
    undefined,
    projectPath,
  );

  if (parsed.errors.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => params.cwd,
        getNewLine: () => "\n",
      }),
    );
  }

  const extraFiles = new Set<string>();
  for (const f of params.extraFileNames ?? []) {
    extraFiles.add(path.resolve(params.cwd, f));
  }

  const records = new Map<string, FileRecord>();

  function statMtimeMs(abs: string): number {
    try {
      return fs.statSync(abs).mtimeMs;
    } catch {
      return -1;
    }
  }

  function ensureRecord(abs: string): FileRecord {
    const r = records.get(abs);
    if (r) return r;
    const rec: FileRecord = { version: 0, mtimeMs: -1, pendingReload: true };
    records.set(abs, rec);
    return rec;
  }

  function refreshMetadata(abs: string) {
    const mtimeMs = statMtimeMs(abs);
    const rec = ensureRecord(abs);

    // If file disappeared, mark pending but keep old snapshot.
    if (mtimeMs === -1) return;

    if (rec.mtimeMs !== mtimeMs) {
      rec.mtimeMs = mtimeMs;
      rec.version++;
      rec.pendingReload = true;
    }
  }

  const readFileText = (filePath: string) => {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(params.cwd, filePath);
    refreshMetadata(abs);
    const rec = ensureRecord(abs);

    if (!rec.pendingReload && rec.text != null) return rec.text;
    const text = ts.sys.readFile(abs) ?? fs.readFileSync(abs, "utf8");
    rec.text = text;
    rec.snapshot = ts.ScriptSnapshot.fromString(text);
    rec.pendingReload = false;
    return text;
  };

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => {
      const base = parsed.fileNames;
      if (extraFiles.size === 0) return base;
      return [...base, ...Array.from(extraFiles)];
    },
    getScriptVersion: (fileName) => {
      const abs = path.isAbsolute(fileName) ? fileName : path.resolve(params.cwd, fileName);
      refreshMetadata(abs);
      return String(ensureRecord(abs).version);
    },
    getScriptSnapshot: (fileName) => {
      const abs = path.isAbsolute(fileName) ? fileName : path.resolve(params.cwd, fileName);
      refreshMetadata(abs);
      const rec = ensureRecord(abs);
      if (!rec.pendingReload && rec.snapshot) return rec.snapshot;
      try {
        const text = ts.sys.readFile(abs) ?? fs.readFileSync(abs, "utf8");
        rec.text = text;
        rec.snapshot = ts.ScriptSnapshot.fromString(text);
        rec.pendingReload = false;
        return rec.snapshot;
      } catch {
        return undefined;
      }
    },
    getCurrentDirectory: () => params.cwd,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

  const formatResult: TsContext["formatResult"] = (input) => {
    const { line, character } = posToLineChar1Based(input.sourceFile, input.pos);
    const docs = ts.displayPartsToString(input.quickInfo.documentation ?? []) || undefined;
    const tags = (input.quickInfo.tags ?? []).map((t) => ({
      name: t.name,
      text: ts.displayPartsToString(t.text ?? []) || undefined,
    }));
    const deprecatedTag = tags.find((t) => t.name === "deprecated");
    const deprecated = Boolean(deprecatedTag);
    const deprecatedText = deprecatedTag?.text;
    const display = quickInfoToDisplay(input.quickInfo);

    const r: TypehintResult = {
      filePath: input.filePath,
      line: input.line ?? line,
      character,
      pos: input.pos,
      preview: input.preview,
      kind: input.quickInfo.kind,
      kindModifiers: input.quickInfo.kindModifiers,
      display,
      documentation: docs,
      tags: tags.length ? tags : undefined,
      deprecated,
      deprecatedText,
      expandedType: input.expandedType,
    };
    return r;
  };

  // Preload extra files so TS can include them quickly.
  for (const f of extraFiles) {
    readFileText(f);
  }

  const addExtraFile = (filePath: string) => {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(params.cwd, filePath);
    if (!extraFiles.has(abs)) {
      extraFiles.add(abs);
      // Mark as changed so TS can pick it up.
      refreshMetadata(abs);
    }
    // Ensure we have a snapshot.
    readFileText(abs);
  };

  return {
    languageService,
    projectPath,
    readFileText,
    formatResult,
    addExtraFile,
  };
}
