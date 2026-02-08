import ts from "typescript";

export type ExpandOptions = {
  depth: number;
  maxProps: number;
  maxUnion: number;
  maxChars: number;
};

function typeToString(
  checker: ts.TypeChecker,
  type: ts.Type,
  node?: ts.Node,
): string {
  return checker.typeToString(
    type,
    node,
    ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
      ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
  );
}

function signatureToString(
  checker: ts.TypeChecker,
  sig: ts.Signature,
  node?: ts.Node,
): string {
  return checker.signatureToString(
    sig,
    node,
    ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
      ts.TypeFormatFlags.WriteTypeArgumentsOfSignature,
  );
}

export function expandTypeBounded(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
  opts: ExpandOptions,
): string {
  const seen = new WeakSet<ts.Type>();
  let budget = 2000;

  const out = expandInner(type, opts.depth);
  if (out.length <= opts.maxChars) return out;
  return out.slice(0, Math.max(0, opts.maxChars - 3)) + "...";

  function expandInner(t: ts.Type, depth: number): string {
    if (budget-- <= 0) return typeToString(checker, t, node);

    if (seen.has(t)) return typeToString(checker, t, node);
    seen.add(t);

    if (depth <= 0) return compactType(t);

    if (t.isUnion()) {
      const members = t.types
        .slice(0, opts.maxUnion)
        .map((m) => expandUnionMember(m, depth - 1));
      const suffix = t.types.length > opts.maxUnion ? " | ..." : "";
      return members.join(" | ") + suffix;
    }

    if (t.isIntersection()) {
      return t.types.map((m) => expandInner(m, depth - 1)).join(" & ");
    }

    if (t.flags & ts.TypeFlags.Any) return "any";
    if (t.flags & ts.TypeFlags.Unknown) return "unknown";
    if (t.flags & ts.TypeFlags.Never) return "never";
    if (t.flags & ts.TypeFlags.String) return "string";
    if (t.flags & ts.TypeFlags.Number) return "number";
    if (t.flags & ts.TypeFlags.Boolean) return "boolean";
    if (t.flags & ts.TypeFlags.BigInt) return "bigint";
    if (t.flags & ts.TypeFlags.Null) return "null";
    if (t.flags & ts.TypeFlags.Undefined) return "undefined";

    if (t.isLiteral()) {
      return typeToString(checker, t, node);
    }

    const apparent = checker.getApparentType(t);
    const callSigs = apparent.getCallSignatures();
    const constructSigs = apparent.getConstructSignatures();

    const props = checker.getPropertiesOfType(apparent);
    const hasMembers =
      props.length > 0 || callSigs.length > 0 || constructSigs.length > 0;
    if (!hasMembers) return typeToString(checker, t, node);

    const chunks: string[] = [];
    chunks.push("{");

    const sigs: string[] = [];
    if (constructSigs.length) {
      const sig = constructSigs[0]!;
      sigs.push(`new ${signatureToString(checker, sig, node)};`);
    }
    if (callSigs.length) {
      const sig = callSigs[0]!;
      sigs.push(`${signatureToString(checker, sig, node)};`);
    }

    if (sigs.length) {
      chunks.push(" " + sigs.join(" "));
    }

    const maxProps = opts.maxProps;
    const shown = props.slice(0, maxProps);
    for (const p of shown) {
      const isOptional = (p.getFlags() & ts.SymbolFlags.Optional) !== 0;
      const pType = checker.getTypeOfSymbolAtLocation(p, node);
      const pText = isOptional
        ? expandOptional(pType, depth - 1)
        : expandInner(pType, depth - 1);
      chunks.push(` ${p.getName()}${isOptional ? "?" : ""}: ${pText};`);
    }

    if (props.length > maxProps) {
      chunks.push(" ...;");
    }

    const stringIndex = checker.getIndexTypeOfType(
      apparent,
      ts.IndexKind.String,
    );
    if (stringIndex) {
      chunks.push(` [key: string]: ${expandInner(stringIndex, depth - 1)};`);
    }
    const numberIndex = checker.getIndexTypeOfType(
      apparent,
      ts.IndexKind.Number,
    );
    if (numberIndex) {
      chunks.push(` [index: number]: ${expandInner(numberIndex, depth - 1)};`);
    }

    chunks.push(" }");
    return chunks.join("");
  }

  function unionMemberName(t: ts.Type): string | undefined {
    // Prefer alias name when present.
    const alias = t.aliasSymbol;
    const sym = alias ?? t.getSymbol();
    if (!sym) return undefined;
    const name = sym.getName();
    if (!name || name.startsWith("__")) return undefined;
    return name;
  }

  function compactType(t: ts.Type): string {
    // For primitives and literal types, always use TypeScript's stringifier.
    if (
      t.isLiteral() ||
      (t.flags &
        (ts.TypeFlags.StringLike |
          ts.TypeFlags.NumberLike |
          ts.TypeFlags.BooleanLike |
          ts.TypeFlags.BigIntLike |
          ts.TypeFlags.Null |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Any |
          ts.TypeFlags.Unknown |
          ts.TypeFlags.Never)) !==
        0
    ) {
      return typeToString(checker, t, node);
    }

    if (t.isUnion()) {
      const members = t.types
        .slice(0, opts.maxUnion)
        .map((m) => unionMemberName(m) ?? typeToString(checker, m, node));
      const suffix = t.types.length > opts.maxUnion ? " | ..." : "";
      return members.join(" | ") + suffix;
    }
    if (t.isIntersection()) {
      return t.types
        .map((m) => unionMemberName(m) ?? typeToString(checker, m, node))
        .join(" & ");
    }

    const named = unionMemberName(t);
    if (named) return named;

    const apparent = checker.getApparentType(t);
    const hasMembers =
      checker.getPropertiesOfType(apparent).length > 0 ||
      apparent.getCallSignatures().length > 0 ||
      apparent.getConstructSignatures().length > 0;
    if (hasMembers) return "{ ... }";

    return typeToString(checker, t, node);
  }

  function expandUnionMember(t: ts.Type, depth: number): string {
    const name = unionMemberName(t);
    if (!name) return expandInner(t, depth);

    // If this is a recursive reference, expanding will just give the name back.
    if (seen.has(t)) return name;

    const inner = expandInner(t, depth);
    if (inner === name) return name;
    // Keep both: the name helps preserve semantics, the structure helps codegen.
    return `${name} /*= ${inner} */`;
  }

  function expandOptional(pType: ts.Type, depth: number): string {
    if (!pType.isUnion()) return expandInner(pType, depth);
    const members = pType.types.filter(
      (t) => (t.flags & ts.TypeFlags.Undefined) === 0,
    );
    if (members.length === pType.types.length) return expandInner(pType, depth);
    if (members.length === 0) return "undefined";
    if (members.length === 1) return expandInner(members[0]!, depth);
    const shown = members
      .slice(0, opts.maxUnion)
      .map((m) => expandUnionMember(m, depth - 1));
    const suffix = members.length > opts.maxUnion ? " | ..." : "";
    return shown.join(" | ") + suffix;
  }
}
