type U = { a: 1 } | { b: 2 } | { c: 3 };

const x: { u: U } = { u: { a: 1 } };

x.u;
