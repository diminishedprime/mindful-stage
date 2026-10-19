import type { OutOfBand } from "./out-of-band";
import { InFlight } from "./in-flight";
import {
  type Answer,
  callKey,
  fingerprintOf,
  type Recordings,
  snapshotOf,
} from "./recording";

const DRIVER_ACTIONS = new Set<string | symbol>([
  "commitStaged",
  "push",
  "modifyTrackedFile",
  "modifyTrackedFiles",
  "modifyTrackedLine",
  "insertLines",
  "deleteLines",
  "appendLine",
  "writeObject",
  "writeGitInternal",
  "createScratchFile",
  "createRepo",
  "initRepo",
  "removeRepo",
  "removeGitDir",
  "changeSetting",
  "installTheme",
  "installBrokenTheme",
  "installCircularTheme",
  "installDefaultThemes",
  "stageFile",
  "deleteTrackedFile",
  "createUntrackedFile",
  "save",
  "createOneLineFile",
]);

export function recordedDriver<Driver extends OutOfBand>(
  driver: Driver,
  recorder: Recorder,
): Driver {
  return new Proxy(driver, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || !DRIVER_ACTIONS.has(property)) {
        return value;
      }
      return async (...args: unknown[]) => {
        const from = recorder.now();
        await (value as (...args: unknown[]) => Promise<void>).apply(
          target,
          args,
        );
        recorder.changed(from, callKey(target.root, String(property), args));
      };
    },
  });
}

export class Recorder {
  private readonly changes = new InFlight();

  constructor(
    private readonly root: string,
    private readonly recordings: Recordings,
  ) {
    recordings.recordStart(this.now());
  }

  track(change: Promise<unknown>): void {
    this.changes.track(change);
  }

  changesSettled(): Promise<void> {
    return this.changes.settled();
  }

  now(): string {
    const snapshot = snapshotOf(this.root);
    const hash = fingerprintOf(snapshot);
    this.recordings.recordSnapshot(hash, snapshot);
    return hash;
  }

  answered(hash: string, key: string, answer: Answer): void {
    this.recordings.recordAnswer(hash, key, answer);
  }

  changed(from: string, key: string): void {
    this.recordings.recordTransition(from, key, this.now());
  }

  save(): void {
    this.recordings.save();
  }
}
