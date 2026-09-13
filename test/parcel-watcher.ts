import { subscribe } from "@parcel/watcher";
import type { Disposable, Watcher } from "../src/types";

export class ParcelWatcher implements Watcher {
  async watch(
    root: string,
    onChange: (path: string) => void,
  ): Promise<Disposable> {
    const subscription = await subscribe(root, (_error, events) => {
      for (const event of events) {
        onChange(event.path);
      }
    });
    return { dispose: () => subscription.unsubscribe() };
  }
}
