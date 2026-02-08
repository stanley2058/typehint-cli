type ArgValue = string | boolean | string[];

export type ParsedArgs = {
  positionals: string[];
  flags: Record<string, ArgValue>;
};

function isFlagToken(s: string) {
  return s.startsWith("--") || (s.startsWith("-") && s !== "-");
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, ArgValue> = Object.create(null);

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;

    if (tok === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (!isFlagToken(tok)) {
      positionals.push(tok);
      continue;
    }

    if (tok.startsWith("--no-")) {
      const key = tok.slice("--no-".length);
      flags[key] = false;
      continue;
    }

    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        const key = tok.slice(2, eq);
        const value = tok.slice(eq + 1);
        flags[key] = value;
        continue;
      }

      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next != null && !isFlagToken(next)) {
        const prev = flags[key];
        if (prev == null) flags[key] = next;
        else if (typeof prev === "string") flags[key] = [prev, next];
        else if (Array.isArray(prev)) prev.push(next);
        else flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    // Short flags: -abc => -a -b -c
    const shorts = tok.slice(1);
    if (shorts.length === 1) {
      const key = shorts;
      const next = argv[i + 1];
      if (next != null && !isFlagToken(next)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    for (const ch of shorts) flags[ch] = true;
  }

  return { positionals, flags };
}

export function getFlagString(flags: Record<string, ArgValue>, name: string): string | undefined {
  const v = flags[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[v.length - 1];
  return undefined;
}

export function getFlagStrings(flags: Record<string, ArgValue>, name: string): string[] {
  const v = flags[name];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return [...v];
  return [];
}

export function getFlagNumber(
  flags: Record<string, ArgValue>,
  name: string,
  opts: { defaultValue?: number; min?: number } = {},
): number {
  const v = flags[name];
  const s = typeof v === "string" ? v : Array.isArray(v) ? v[v.length - 1] : undefined;
  if (s == null) return opts.defaultValue ?? NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return opts.defaultValue ?? NaN;
  if (opts.min != null && n < opts.min) return opts.min;
  return n;
}

export function getFlagBoolean(
  flags: Record<string, ArgValue>,
  name: string,
  defaultValue: boolean,
): boolean {
  const v = flags[name];
  if (typeof v === "boolean") return v;
  const s = typeof v === "string" ? v : Array.isArray(v) ? v[v.length - 1] : undefined;
  if (s != null) {
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return defaultValue;
}
