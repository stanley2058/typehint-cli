import fs from "node:fs";

const packageVersion = (await Bun.file("./package.json").json()).version;

fs.rmSync("./dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  naming: "index.js",
  target: "node",
  // Resolve TypeScript from node_modules at runtime instead of inlining ~9 MB of it.
  external: ["typescript"],
  banner: "#!/usr/bin/env node",
  define: {
    PACKAGE_VERSION: `"${packageVersion}"`,
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

fs.chmodSync("./dist/index.js", 0o755);
