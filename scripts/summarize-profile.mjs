// LLM slop. Nobody should bother reading a single line of this.
import fs from "fs";
import path from "path";

const SLICE_MS = 10;

const dir = process.argv[2];
for (const file of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".cpuprofile"))) {
  summarize(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
}

function summarize(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parent.set(child, node.id);
    }
  }
  const frames = (id) => {
    const stack = [];
    for (
      let current = id;
      current !== undefined;
      current = parent.get(current)
    ) {
      stack.push(byId.get(current).callFrame);
    }
    return stack;
  };

  const selfByFile = new Map();
  const selfByFunction = new Map();
  const inclusiveSrc = new Map();
  const slices = new Map();
  let elapsed = 0;
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    elapsed += ms;
    const stack = frames(id);
    const [leaf] = stack;
    add(selfByFile, shorten(leaf.url) || leaf.functionName, ms);
    add(selfByFunction, label(leaf), ms);
    for (const frame of new Set(stack.filter(inSrc).map(label))) {
      add(inclusiveSrc, frame, ms);
    }
    const slice = Math.floor(elapsed / SLICE_MS) * SLICE_MS;
    slices.set(slice, slices.get(slice) ?? new Map());
    add(slices.get(slice), activity(leaf, stack), ms);
  });

  console.log(`sampled ${elapsed.toFixed(0)}ms`);
  console.log(`\nself time by file\n${top(selfByFile, 15)}`);
  console.log(`\nself time by function\n${top(selfByFunction, 20)}`);
  console.log(`\ninclusive time in src\n${top(inclusiveSrc, 25)}`);
  console.log(`\ntimeline in ${SLICE_MS}ms slices`);
  for (const [slice, kinds] of slices) {
    const parts = [...kinds].map(([kind, ms]) => `${kind}=${ms.toFixed(0)}`);
    console.log(`${String(slice).padStart(6)}ms  ${parts.join(" ")}`);
  }
}

function activity(leaf, stack) {
  if (leaf.functionName === "(idle)") {
    return "idle";
  }
  if (stack.some((frame) => frame.functionName === "spawn")) {
    return "spawn";
  }
  if (stack.some(inSrc)) {
    return "src";
  }
  if (stack.some((frame) => frame.url.includes("simple-git"))) {
    return "simple-git";
  }
  return "other";
}

function inSrc(frame) {
  return frame.url.includes("/mindful-stage/src/");
}

function label(frame) {
  return `${frame.functionName || "(anonymous)"} ${shorten(frame.url)}:${frame.lineNumber + 1}`;
}

function shorten(url) {
  return url
    .replace(/^.*\/mindful-stage\//, "")
    .replace(/^.*node_modules\/\.pnpm\/([^/]+)\/.*/, "$1");
}

function add(totals, key, ms) {
  totals.set(key, (totals.get(key) ?? 0) + ms);
}

function top(totals, count) {
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, ms]) => `${ms.toFixed(0).padStart(6)}ms  ${key}`)
    .join("\n");
}
