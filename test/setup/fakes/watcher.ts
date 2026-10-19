import type { Disposable, OnChange, Watcher } from "../../../src/types";

// Lets a test wait until the app has reacted to a change on disk. The polyrepo
// does this after every write it makes, so mutations return once the app has
// seen them.
export class SettlingWatcher implements Watcher {
  private readonly waiting = new Map<
    string,
    Array<(reaction: Promise<void>) => void>
  >();

  constructor(private readonly real: Watcher) {}

  watch(root: string, onChange: OnChange): Promise<Disposable> {
    return this.real.watch(root, (path, event) => {
      const reaction = onChange(path, event);
      const waiting = this.waiting.get(path) ?? [];
      this.waiting.delete(path);
      for (const resolve of waiting) {
        resolve(reaction);
      }
      return reaction;
    });
  }

  nextReaction(path: string): Promise<void> {
    return new Promise<Promise<void>>((resolve) => {
      this.waiting.set(path, [...(this.waiting.get(path) ?? []), resolve]);
    }).then((reaction) => reaction);
  }
}
