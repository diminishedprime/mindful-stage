function isLoggerCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "MemberExpression" &&
    node.callee.object.object.type === "ThisExpression" &&
    node.callee.object.property.name === "logger"
  );
}

export const strykerPlugins = [
  {
    kind: "Ignore",
    name: "logging",
    value: {
      shouldIgnore(path) {
        const node = path.node;
        if (
          isLoggerCall(node) ||
          (node.type === "ExpressionStatement" && isLoggerCall(node.expression))
        ) {
          return "logging is excluded from mutation testing";
        }
        return undefined;
      },
    },
  },
];
