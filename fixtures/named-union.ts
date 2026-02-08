type Foo = { a: 1 };
type Bar = { b: 2 };
type Baz = { c: 3 };

type T = Foo | Bar | Baz;

const x: { t: T } = { t: { a: 1 } };

x.t;
