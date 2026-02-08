import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { quickInfoToDisplay, type TypehintResult } from "../output.ts";
import { findUpTsconfig } from "../util/tsconfig.ts";
import { posToLineChar1Based } from "./position.ts";

export type TsContext = {
  languageService: ts.LanguageService;
  projectPath: string;
  readFileText: (filePath: string) => string;
  formatResult: (input: {
    filePath: string;
    sourceFile: ts.SourceFile;
    pos: number;
    quickInfo: ts.QuickInfo;
    expandedType?: string;
    preview?: string;
    line?: number;
  }) => TypehintResult;
};

export async function createTsContext(params: {
  cwd: string;
  project?: string;
  extraFileNames?: string[];
}): Promise<TsContext> {
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

  const extra = (params.extraFileNames ?? []).map((f) => path.resolve(params.cwd, f));
  const allFiles = Array.from(new Set([...parsed.fileNames, ...extra]));

  const versions = new Map<string, number>();
  const snapshots = new Map<string, ts.IScriptSnapshot>();
  const fileTextCache = new Map<string, string>();

  const readFileText = (filePath: string) => {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(params.cwd, filePath);
    const cached = fileTextCache.get(abs);
    if (cached != null) return cached;
    const text = ts.sys.readFile(abs) ?? fs.readFileSync(abs, "utf8");
    fileTextCache.set(abs, text);
    return text;
  };

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => allFiles,
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      const abs = path.isAbsolute(fileName) ? fileName : path.resolve(params.cwd, fileName);
      const cached = snapshots.get(abs);
      if (cached) return cached;
      const text = readFileText(abs);
      const snap = ts.ScriptSnapshot.fromString(text);
      snapshots.set(abs, snap);
      return snap;
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

  return {
    languageService,
    projectPath,
    readFileText,
    formatResult,
  };
}
