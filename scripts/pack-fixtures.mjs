import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as v8 from "v8";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtures = path.join(root, "test", "setup", "fixtures");
const pack = path.join(
  root,
  "node_modules",
  ".cache",
  "mindful-stage",
  "fixtures.pack",
);

const index = {};
const blobs = [];
let offset = 0;
for (const name of fs.readdirSync(fixtures).sort()) {
  if (!name.endsWith(".json")) {
    continue;
  }
  const state = JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));
  const blob = v8.serialize(state);
  index[name.slice(0, -".json".length)] = [offset, blob.length];
  offset += blob.length;
  blobs.push(blob);
}

const header = v8.serialize(index);
const headerLength = Buffer.alloc(4);
headerLength.writeUInt32LE(header.length);
fs.mkdirSync(path.dirname(pack), { recursive: true });
fs.writeFileSync(pack, Buffer.concat([headerLength, header, ...blobs]));
console.log(
  `packed ${blobs.length} fixtures into ${path.relative(root, pack)}`,
);
