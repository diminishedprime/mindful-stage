import * as path from "path";
import type { MemoryFs } from "../memory-fs";
import { OutOfBand } from ".";
import {
  callKey,
  type Recorded,
  type Recordings,
  rootedBytes,
} from "../recording";

export type OutOfBandFs = {
  load(json: Record<string, Buffer | null>): void;
  mkdirSync(dir: string, options: { recursive: true }): unknown;
  writeFileSync(file: string, content: string | Uint8Array): void;
  rmSync(
    target: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  touch(dir: string): void;
};

const decoded = new Map<string, Buffer>();

function bytesOf(content: string): Buffer {
  let bytes = decoded.get(content);
  if (bytes === undefined) {
    bytes = rootedBytes(ReplayOutOfBand.ROOT, Buffer.from(content, "base64"));
    decoded.set(content, bytes);
  }
  return Buffer.from(bytes);
}

function under(dirs: Set<string>, file: string): boolean {
  for (
    let dir = path.posix.dirname(file);
    dir !== ".";
    dir = path.posix.dirname(dir)
  ) {
    if (dirs.has(dir)) {
      return true;
    }
  }
  return false;
}

export class ReplayOutOfBand extends OutOfBand {
  static readonly ROOT = "/mindful-stage";

  private constructor(
    private readonly fs: OutOfBandFs,
    private readonly recordings: Recordings,
    private current: string,
  ) {
    super(ReplayOutOfBand.ROOT);
  }

  static load(
    memory: MemoryFs,
    recordings: Recordings,
    from?: string,
  ): ReplayOutOfBand {
    const start = recordings.start();
    if (from !== undefined) {
      const reused = new ReplayOutOfBand(memory.polyrepoFs, recordings, from);
      void reused.moveTo(start);
      return reused;
    }
    const polyrepo = new ReplayOutOfBand(memory.polyrepoFs, recordings, start);
    const recorded = recordings.state(start);
    const json: Record<string, Buffer | null> = {};
    for (const dir of recorded.directories) {
      json[path.join(polyrepo.root, dir)] = null;
    }
    for (const [file, content] of Object.entries(recorded.files)) {
      json[path.join(polyrepo.root, file)] = bytesOf(content);
    }
    polyrepo.fs.load(json);
    return polyrepo;
  }

  override async touchFolder(dir: string): Promise<void> {
    const reaction = this.reactionTo(this.pathTo(dir));
    this.fs.touch(this.pathTo(dir));
    await reaction;
  }

  override get replayed(): Recorded {
    return this.recordings.state(this.current);
  }

  override followApp(key: string): void {
    this.awaitLater(this.moveTo(this.next(key)));
  }

  protected override async follow(
    method: string,
    args: unknown[],
  ): Promise<void> {
    await this.moveTo(this.next(callKey(this.root, method, args)));
  }

  get at(): string {
    return this.current;
  }

  async dispose(): Promise<void> {}

  private next(key: string): string {
    const to = this.replayed.transitions[key];
    if (to === undefined) {
      throw new Error(`${key} isn't recorded from state ${this.current}`);
    }
    return to;
  }

  private moveTo(hash: string): Promise<unknown> {
    const current = this.replayed;
    const target = this.recordings.state(hash);
    const currentDirs = new Set(current.directories);
    const targetDirs = new Set(target.directories);
    const vanished = new Set(
      current.directories.filter((dir) => !targetDirs.has(dir)),
    );
    const removedDirs = [...vanished].filter((dir) => !under(vanished, dir));
    const removedSet = new Set(removedDirs);
    const removedFiles = Object.keys(current.files).filter(
      (file) => !(file in target.files) && !under(removedSet, file),
    );
    const addedDirs = target.directories.filter((dir) => !currentDirs.has(dir));
    const written = Object.entries(target.files).filter(
      ([file, content]) =>
        current.files[file] !== content &&
        (current.indexes[file] === undefined ||
          current.indexes[file] !== target.indexes[file]),
    );
    for (const dir of removedDirs) {
      this.fs.rmSync(path.join(this.root, dir), {
        recursive: true,
        force: true,
      });
    }
    for (const file of removedFiles) {
      this.fs.rmSync(path.join(this.root, file));
    }
    for (const dir of addedDirs) {
      this.fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    }
    for (const [file, content] of written) {
      this.fs.writeFileSync(path.join(this.root, file), bytesOf(content));
    }
    this.current = hash;
    return Promise.all(
      [
        ...removedDirs,
        ...removedFiles,
        ...addedDirs,
        ...written.map(([file]) => file),
      ]
        .map((changed) => path.join(this.root, changed))
        .filter((changed) =>
          this.workspaceFolders.some((folder) =>
            changed.startsWith(`${folder}${path.sep}`),
          ),
        )
        .map((changed) => this.reactionTo(changed)),
    );
  }
}
