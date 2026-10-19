import * as path from "path";
import type {
  AsyncSubscription,
  Event,
  SubscribeCallback,
} from "@parcel/watcher";
import { createFsFromVolume, Volume } from "memfs";
import type { DirEntry, Fs } from "../../src/types";
import type { OutOfBandFs } from "./out-of-band/replay";

export class MemoryFs {
  private readonly volume = new Volume();
  private readonly memory = createFsFromVolume(this.volume);

  readonly fs: Fs = {
    promises: {
      readFile: async (file) => {
        await new Promise((resolve) => setImmediate(resolve));
        return (await this.memory.promises.readFile(file)) as Buffer;
      },
      open: async (file) => {
        const handle = await this.memory.promises.open(file);
        if (!(await this.memory.promises.stat(file)).isDirectory()) {
          return handle as typeof handle & AsyncDisposable;
        }
        return {
          read: () =>
            Promise.reject(
              Object.assign(
                new Error("EISDIR: illegal operation on a directory, read"),
                { code: "EISDIR" },
              ),
            ),
          [Symbol.asyncDispose]: () => handle.close(),
        };
      },
      stat: (file) => this.memory.promises.stat(file),
      readdir: async (dir, options) =>
        (await this.memory.promises.readdir(
          dir,
          options,
        )) as unknown as DirEntry[],
    },
  };

  readonly polyrepoFs: OutOfBandFs = {
    load: (json) => this.volume.fromJSON(json),
    mkdirSync: (dir, options) => this.memory.mkdirSync(dir, options),
    writeFileSync: (file, content) => this.memory.writeFileSync(file, content),
    rmSync: (target, options) => this.memory.rmSync(target, options),
    touch: (dir) => {
      for (const [root, onEvents] of this.subscribers) {
        if (dir.startsWith(`${root}${path.sep}`)) {
          queueMicrotask(() => onEvents(null, [{ path: dir, type: "create" }]));
        }
      }
    },
  };

  private readonly subscribers = new Map<string, SubscribeCallback>();

  subscribe = async (
    root: string,
    onEvents: SubscribeCallback,
  ): Promise<AsyncSubscription> => {
    const watcher = this.volume.watch(
      root,
      { recursive: true },
      (change, name) => {
        const changed = path.join(root, String(name));
        queueMicrotask(() =>
          onEvents(null, [
            { path: changed, type: this.typeOf(change, changed) },
          ]),
        );
      },
    );
    this.subscribers.set(root, onEvents);
    return {
      unsubscribe: async () => {
        this.subscribers.delete(root);
        watcher.close();
      },
    };
  };

  private typeOf(change: string, changed: string): Event["type"] {
    if (change === "change") {
      return "update";
    }
    return this.volume.existsSync(changed) ? "create" : "delete";
  }
}
