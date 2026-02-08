type Node = {
  value: number;
  next?: Node;
};

const n: Node = { value: 1 };

n.next?.next?.value;
