import { describe, expect, test } from "bun:test";

async function runCli(args: string[]) {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

describe("typehint at", () => {
  test("prints QuickInfo and expanded type (json)", async () => {
    const res = await runCli([
      "at",
      "--file",
      "fixtures/sample.ts",
      "--line",
      "19",
      "--char",
      "5",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    expect(res.stderr.trim()).toBe("");

    const out = JSON.parse(res.stdout);
    expect(out.display).toBe("(property) bar: Bar");
    expect(out.expandedType).toContain("baz: number");
    expect(out.expandedType).toContain("nested?: { ok: true; }");
    expect(out.deprecated).toBe(false);
  });

  test("depth=0 avoids structural expansion", async () => {
    const res = await runCli([
      "at",
      "--file",
      "fixtures/sample.ts",
      "--line",
      "19",
      "--char",
      "5",
      "--depth",
      "0",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.expandedType).not.toContain("baz: number");
  });

  test("surfaces @deprecated tags", async () => {
    // oldFn(); on line 10, column 1
    const res = await runCli([
      "at",
      "--file",
      "fixtures/deprecated.ts",
      "--line",
      "10",
      "--char",
      "1",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.deprecated).toBe(true);
    expect(String(out.deprecatedText ?? "")).toContain("Use newFn");
  });
});

describe("typehint grep", () => {
  test("filters matches in comments and strings", async () => {
    const res = await runCli([
      "grep",
      "--root",
      "fixtures",
      "--glob",
      "filter.ts",
      "--regex",
      "foo\\.bar",
      "--target",
      "bar",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].filePath).toContain("fixtures/filter.ts");
    expect(out.candidates[0].preview).toContain("foo.bar.baz");
  });

  test("returns multiple candidates when there are multiple code occurrences", async () => {
    const res = await runCli([
      "grep",
      "--root",
      "fixtures",
      "--glob",
      "ambiguous.ts",
      "--regex",
      "foo\\.bar",
      "--target",
      "bar",
      "--json",
    ]);

    expect(res.exitCode).toBe(3);
    const out = JSON.parse(res.stdout);
    const ok = out.candidates.filter((c: any) => !c.error);
    expect(ok.length).toBeGreaterThanOrEqual(2);
  });
});

describe("type expansion controls", () => {
  test("maxUnion truncates large unions", async () => {
    // x.u; on line 5, column 3
    const res = await runCli([
      "at",
      "--file",
      "fixtures/union.ts",
      "--line",
      "5",
      "--char",
      "3",
      "--maxUnion",
      "2",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(String(out.expandedType ?? "")).toContain("| ...");
  });

  test("self-referencing types do not infinitely expand", async () => {
    // n.next?.next?.value; hover on `next` (line 8, column 3)
    const res = await runCli([
      "at",
      "--file",
      "fixtures/recursive.ts",
      "--line",
      "8",
      "--char",
      "3",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    // Key property: we see the recursive reference by name, not an infinite object.
    expect(String(out.expandedType ?? "")).toContain("next?: Node");
  });

  test("named union members keep names and structure", async () => {
    // x.t; on line 9, column 3
    const res = await runCli([
      "at",
      "--file",
      "fixtures/named-union.ts",
      "--line",
      "9",
      "--char",
      "3",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    const s = String(out.expandedType ?? "");
    expect(s).toContain("Foo");
    expect(s).toContain("a: 1");
    expect(s).toContain("| ");
  });

  test("depth cap prevents deep inline expansion", async () => {
    // x.a; on line 5, column 3
    const res = await runCli([
      "at",
      "--file",
      "fixtures/deep-inline.ts",
      "--line",
      "5",
      "--char",
      "3",
      "--depth",
      "0",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out.expandedType).toBe("{ ... }");
  });

  test("monster builder type does not explode and stays within maxChars", async () => {
    const text = await Bun.file("fixtures/monster.ts").text();
    const idx = text.indexOf(".buildWith({})");
    expect(idx).toBeGreaterThan(0);

    // Position on the `b` in `.buildWith`.
    const pos = idx + 1;

    const res = await runCli([
      "at",
      "--file",
      "fixtures/monster.ts",
      "--pos",
      String(pos),
      "--maxChars",
      "800",
      "--json",
    ]);

    expect(res.exitCode).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(String(out.display)).toContain("buildWith");
    expect(String(out.expandedType ?? "").length).toBeLessThanOrEqual(800);
  });
});
