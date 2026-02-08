type Bar = { baz: number };

const foo: { bar: Bar } = { bar: { baz: 1 } };

// comment mention foo.bar should be ignored
const s1 = "foo.bar";
const s2 = `foo.bar`;

foo.bar.baz;
