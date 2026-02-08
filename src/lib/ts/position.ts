import ts from "typescript";

export function posFromLineChar(sourceFile: ts.SourceFile, line1: number, character1: number): number {
  return sourceFile.getPositionOfLineAndCharacter(line1 - 1, character1 - 1);
}

export function posToLineChar1Based(sourceFile: ts.SourceFile, pos: number): { line: number; character: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, character: lc.character + 1 };
}

function findSmallestNodeAtPos(root: ts.Node, pos: number): ts.Node {
  let best: ts.Node = root;
  function visit(node: ts.Node) {
    if (pos < node.getFullStart() || pos >= node.getEnd()) return;
    if ((node.getEnd() - node.getFullStart()) <= (best.getEnd() - best.getFullStart())) {
      best = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return best;
}

export function getNodeForHover(sourceFile: ts.SourceFile, pos: number): ts.Node {
  const node = findSmallestNodeAtPos(sourceFile, pos);

  // Prefer the property name identifier in `foo.bar`.
  if (ts.isIdentifier(node) && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
    return node;
  }

  // For `foo["bar"]` keep the string literal.
  if (ts.isStringLiteralLike(node) && ts.isElementAccessExpression(node.parent)) {
    return node;
  }

  // If we landed on `foo.bar` as a whole, shift to `.name` if possible.
  if (ts.isPropertyAccessExpression(node) && pos >= node.name.getStart() && pos <= node.name.getEnd()) {
    return node.name;
  }

  return node;
}
