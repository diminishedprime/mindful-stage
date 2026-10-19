import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as v8 from "v8";

export type Answer = { ms: number } & ({ result: unknown } | { error: string });

export type Snapshot = {
  directories: string[];
  files: Record<string, string>;
  indexes: Record<string, string>;
};

export type Recorded = Snapshot & {
  answers: Record<string, Answer>;
  transitions: Record<string, string>;
};

export function callKey(root: string, method: string, args: unknown[]): string {
  return JSON.stringify([
    method,
    ...args.map((arg) =>
      typeof arg === "string" && arg.startsWith(`${root}${path.sep}`)
        ? path.relative(root, arg)
        : arg,
    ),
  ]);
}

const ROOT = "<polyrepo>";

export function rootless<Value>(root: string, value: Value): Value {
  return JSON.parse(JSON.stringify(value ?? null).replaceAll(root, ROOT));
}

export function rooted<Value>(root: string, value: Value): Value {
  return JSON.parse(JSON.stringify(value).replaceAll(ROOT, root));
}

export function rootedBytes(root: string, bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString("latin1").replaceAll(ROOT, root), "latin1");
}

function rootlessBytes(root: string, bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString("latin1").replaceAll(root, ROOT), "latin1");
}

type Pack = { bytes: Buffer; index: Record<string, [number, number]> };

export class Recordings {
  private static readonly DIR = path.join(__dirname, "fixtures");
  private static readonly START = path.join(Recordings.DIR, "start");
  private static readonly PACK = path.join(
    __dirname,
    "..",
    "..",
    "node_modules",
    ".cache",
    "mindful-stage",
    "fixtures.pack",
  );

  private static readonly states = new Map<string, Recorded>();
  private static packed: Pack | null | undefined;
  private readonly touched = new Set<string>();

  constructor(private readonly cached = false) {}

  start(): string {
    return fs.readFileSync(Recordings.START, "utf8").trim();
  }

  state(hash: string): Recorded {
    let state = Recordings.states.get(hash);
    if (state === undefined) {
      state = (this.cached
        ? Recordings.fromPack(hash)
        : Recordings.fromJson(hash)) ?? {
        directories: [],
        files: {},
        indexes: {},
        answers: {},
        transitions: {},
      };
      Recordings.states.set(hash, state);
    }
    return state;
  }

  private static fromJson(hash: string): Recorded | undefined {
    const file = Recordings.fileFor(hash);
    if (!fs.existsSync(file)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(file, "utf8")) as Recorded;
  }

  private static fromPack(hash: string): Recorded | undefined {
    Recordings.packed ??= Recordings.readPack();
    if (Recordings.packed === null) {
      return Recordings.fromJson(hash);
    }
    const at = Recordings.packed.index[hash];
    if (at === undefined) {
      return undefined;
    }
    const [offset, length] = at;
    return v8.deserialize(
      Recordings.packed.bytes.subarray(offset, offset + length),
    ) as Recorded;
  }

  private static readPack(): Pack | null {
    if (!fs.existsSync(Recordings.PACK)) {
      return null;
    }
    const bytes = fs.readFileSync(Recordings.PACK);
    const headerLength = bytes.readUInt32LE(0);
    const index = v8.deserialize(
      bytes.subarray(4, 4 + headerLength),
    ) as Pack["index"];
    return { bytes: bytes.subarray(4 + headerLength), index };
  }

  recordStart(hash: string): void {
    fs.mkdirSync(Recordings.DIR, { recursive: true });
    fs.writeFileSync(Recordings.START, `${hash}\n`);
  }

  recordSnapshot(hash: string, snapshot: Snapshot): void {
    const state = this.state(hash);
    if (
      state.directories.length === 0 &&
      Object.keys(state.files).length === 0
    ) {
      state.directories = snapshot.directories;
      state.files = snapshot.files;
      state.indexes = snapshot.indexes;
    }
    this.touched.add(hash);
  }

  recordAnswer(hash: string, key: string, answer: Answer): void {
    const existing = this.state(hash).answers[key];
    if (
      existing !== undefined &&
      Recordings.outcomeOf(existing) !== Recordings.outcomeOf(answer)
    ) {
      throw new Error(`${key} answered differently in state ${hash}`);
    }
    this.state(hash).answers[key] = answer;
    this.touched.add(hash);
  }

  recordTransition(from: string, key: string, to: string): void {
    this.state(from).transitions[key] = to;
    this.touched.add(from);
  }

  save(): void {
    fs.mkdirSync(Recordings.DIR, { recursive: true });
    for (const hash of this.touched) {
      const state = this.state(hash);
      const ordered: Recorded = {
        directories: state.directories,
        files: state.files,
        indexes: state.indexes,
        answers: Object.fromEntries(Object.entries(state.answers).sort()),
        transitions: Object.fromEntries(
          Object.entries(state.transitions).sort(),
        ),
      };
      fs.writeFileSync(
        Recordings.fileFor(hash),
        `${JSON.stringify(ordered, null, 2)}\n`,
      );
    }
    this.touched.clear();
  }

  private static outcomeOf({ ms: _ms, ...outcome }: Answer): string {
    return JSON.stringify(outcome);
  }

  private static fileFor(hash: string): string {
    return path.join(Recordings.DIR, `${hash}.json`);
  }
}

const UNREAD_GIT_FILES = [
  `${path.sep}.git${path.sep}hooks`,
  `${path.sep}.git${path.sep}description`,
];

export function snapshotOf(root: string): Snapshot {
  const directories: string[] = [];
  const files: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    const relative = path.relative(
      root,
      path.join(entry.parentPath, entry.name),
    );
    if (UNREAD_GIT_FILES.some((unread) => relative.includes(unread))) {
      continue;
    }
    if (entry.isDirectory()) {
      directories.push(relative);
    } else if (entry.isFile()) {
      files[relative] = rootlessBytes(
        root,
        fs.readFileSync(path.join(root, relative)),
      ).toString("base64");
    }
  }
  const indexes: Record<string, string> = {};
  for (const file of Object.keys(files)) {
    if (
      path.basename(file) === "index" &&
      path.basename(path.dirname(file)) === ".git"
    ) {
      indexes[file] = createHash("sha256")
        .update(indexEntries(fs.readFileSync(path.join(root, file))))
        .digest("hex");
    }
  }
  return {
    directories: directories.sort(),
    files: Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
    ),
    indexes,
  };
}

function indexEntries(index: Buffer): string {
  const version = index.readUInt32BE(4);
  if (version !== 2 && version !== 3) {
    throw new Error(`index version ${version} isn't supported`);
  }
  const lines: string[] = [];
  let offset = 12;
  for (let entry = 0; entry < index.readUInt32BE(8); entry += 1) {
    const mode = index.readUInt32BE(offset + 24).toString(8);
    const id = index.subarray(offset + 40, offset + 60).toString("hex");
    const flags = index.readUInt16BE(offset + 60);
    const header = (flags & 0x4000) === 0 ? 62 : 64;
    const end = index.indexOf(0, offset + header);
    const file = index.subarray(offset + header, end).toString("utf8");
    lines.push(`${mode} ${id} ${(flags >> 12) & 0b11}\t${file}`);
    offset += (header + (end - offset - header) + 8) & ~7;
  }
  return lines.join("\n");
}

export function fingerprintOf(snapshot: Snapshot): string {
  const hash = createHash("sha256");
  for (const dir of snapshot.directories) {
    hash.update(`dir ${dir}\n`);
  }
  for (const [file, content] of Object.entries(snapshot.files)) {
    const index = snapshot.indexes[file];
    if (index !== undefined) {
      hash.update(`index ${file}\n${index}\n`);
    } else {
      hash.update(`file ${file}\n${content}\n`);
    }
  }
  return hash.digest("hex").slice(0, 16);
}
