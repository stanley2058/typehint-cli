const packageVersion = (await Bun.file("./package.json").json()).version;
await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "node",
  define: {
    PACKAGE_VERSION: `"${packageVersion}"`,
  },
});
