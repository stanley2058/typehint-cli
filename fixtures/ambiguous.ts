type Bar = { baz: number };

const foo: { bar: Bar } = { bar: { baz: 1 } };

foo.bar;
foo.bar.baz;
