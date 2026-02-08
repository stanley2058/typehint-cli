type Bar = {
  baz: number;
  nested?: {
    ok: true;
  };
};

type Foo = {
  bar: Bar;
  union: { a: 1 } | { b: 2 } | { c: 3 };
};

const foo: Foo = {
  bar: { baz: 123, nested: { ok: true } },
  union: { a: 1 },
};

// Hover on "bar" in foo.bar
foo.bar.baz;
