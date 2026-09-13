import type { Disposable, OnChange, Watcher } from "../../src/types";

// Lets a test wait until the app has reacted to a change on disk. The polyrepo
// does this after every write it makes, so mutations return once the app has
// seen them.
export class SettlingWatcher implements Watcher {
  private readonly reacted = new Map<string, Promise<void>>();
  private readonly waiting = new Map<string, Array<(reaction: Promise<void>) => void>>();

  constructor(private readonly real: Watcher) {}

  watch(root: string, onChange: OnChange): Promise<Disposable> {
    return this.real.watch(root, (path) => {
      const reaction = onChange(path);
      this.reacted.set(path, reaction);
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

  async settle(...paths: string[]): Promise<void> {
    await Promise.all(
      paths.map((path) => this.reacted.get(path) ?? this.nextReaction(path)),
    );
  }
}
