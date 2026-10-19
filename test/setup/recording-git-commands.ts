import * as path from "path";
import type { StatusResult } from "simple-git";
import type { GitCommands, GitTrackedMode } from "../../src/types";
import type { OutOfBand } from "./out-of-band";
import type { Recorder } from "./recorder";
import { callKey, rootless } from "./recording";

export class RecordingGitCommands implements GitCommands {
  private writing: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly real: GitCommands,
    private readonly polyrepo: OutOfBand,
    private readonly recorder: Recorder | undefined,
  ) {}

  status(repo: string): Promise<StatusResult> {
    return this.read("status", [repo], () => this.real.status(repo));
  }

  diff(repo: string, file: string, mode: GitTrackedMode): Promise<string> {
    return this.read("diff", [repo, file, mode], () =>
      this.real.diff(repo, file, mode),
    );
  }

  lsFiles(repo: string): Promise<string> {
    return this.read("lsFiles", [repo], () => this.real.lsFiles(repo));
  }

  applyToIndex(repo: string, patch: string): Promise<void> {
    return this.write("applyToIndex", [repo, patch], repo, () =>
      this.real.applyToIndex(repo, patch),
    );
  }

  hashObject(repo: string, content: string): Promise<string> {
    return this.write("hashObject", [repo, content], undefined, () =>
      this.real.hashObject(repo, content),
    );
  }

  updateIndex(repo: string, file: string, hash: string): Promise<void> {
    return this.write("updateIndex", [repo, file, hash], repo, () =>
      this.real.updateIndex(repo, file, hash),
    );
  }

  excludesFile(repo: string): Promise<string> {
    return this.read("excludesFile", [repo], () =>
      this.real.excludesFile(repo),
    );
  }

  dispose(): Promise<void> {
    this.disposed = true;
    return this.real.dispose();
  }

  private async read<Result>(
    method: string,
    args: unknown[],
    call: () => Promise<Result>,
  ): Promise<Result> {
    if (this.recorder === undefined) {
      return call();
    }
    await this.recorder.changesSettled();
    await this.writing;
    return this.ask(this.recorder, this.recorder.now(), method, args, call);
  }

  private async write<Result>(
    method: string,
    args: unknown[],
    indexOf: string | undefined,
    call: () => Promise<Result>,
  ): Promise<Result> {
    const recorder = this.recorder;
    const writing =
      recorder === undefined
        ? call()
        : this.writing.then(async () => {
            await recorder.changesSettled();
            const from = recorder.now();
            const result = await this.ask(recorder, from, method, args, call);
            recorder.changed(from, callKey(this.polyrepo.root, method, args));
            return result;
          });
    this.writing = writing.catch(() => undefined);
    const result = await writing;
    if (indexOf !== undefined) {
      this.polyrepo.awaitLater(
        this.polyrepo.reactionTo(path.join(indexOf, ".git", "index")),
      );
    }
    return result;
  }

  private async ask<Result>(
    recorder: Recorder,
    state: string,
    method: string,
    args: unknown[],
    call: () => Promise<Result>,
  ): Promise<Result> {
    const key = callKey(this.polyrepo.root, method, args);
    const started = performance.now();
    try {
      const result = await call();
      recorder.answered(state, key, {
        result: rootless(this.polyrepo.root, result),
        ms: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      if (this.disposed) {
        throw error;
      }
      recorder.answered(state, key, {
        error: rootless(
          this.polyrepo.root,
          error instanceof Error ? error.message : String(error),
        ),
        ms: Math.round(performance.now() - started),
      });
      throw error;
    }
  }
}
