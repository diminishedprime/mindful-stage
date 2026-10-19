import type {
  AsyncSubscription,
  EventType,
  SubscribeCallback,
} from "@parcel/watcher";
import type { Disposable, FileEvent, OnChange, Watcher } from "../../src/types";
import { RunOnceWorker, ThrottledWorker } from "./vendor/vscode/async";
import { FileChangeType, type IFileChange } from "./vendor/vscode/files";
import { URI } from "./vendor/vscode/stand-ins";
import { coalesceEvents } from "./vendor/vscode/watcher";

// https://github.com/microsoft/vscode/blob/b86195a58d4bd1631fcac882a52adae15fd31f2d/src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts
export class ParcelWatcher implements Watcher {
  private static readonly FILE_CHANGES_HANDLER_DELAY = 75;
  private static readonly EVENTS = new Map<FileChangeType, FileEvent>([
    [FileChangeType.ADDED, "created"],
    [FileChangeType.UPDATED, "changed"],
    [FileChangeType.DELETED, "deleted"],
  ]);
  private static readonly CHANGE_TYPES = new Map<EventType, FileChangeType>([
    ["create", FileChangeType.ADDED],
    ["update", FileChangeType.UPDATED],
    ["delete", FileChangeType.DELETED],
  ]);

  constructor(
    private readonly subscribe: (
      root: string,
      onEvents: SubscribeCallback,
    ) => Promise<AsyncSubscription>,
  ) {}

  async watch(root: string, onChange: OnChange): Promise<Disposable> {
    const emitter = new ThrottledWorker<IFileChange>(
      { maxWorkChunkSize: 500, throttleDelay: 200, maxBufferedWork: 30000 },
      (changes) => {
        for (const change of changes) {
          void onChange(
            change.resource.fsPath,
            ParcelWatcher.EVENTS.get(change.type)!,
          );
        }
      },
    );
    const aggregator = new RunOnceWorker<IFileChange>(
      (changes) => emitter.work(coalesceEvents(changes)),
      ParcelWatcher.FILE_CHANGES_HANDLER_DELAY,
    );
    const subscription = await this.subscribe(root, (_error, events) => {
      for (const { path, type } of events) {
        aggregator.work({
          type: ParcelWatcher.CHANGE_TYPES.get(type)!,
          resource: URI.file(path),
        });
      }
    });
    return {
      dispose: async () => {
        await subscription.unsubscribe();
        aggregator.dispose();
        emitter.dispose();
      },
    };
  }
}
