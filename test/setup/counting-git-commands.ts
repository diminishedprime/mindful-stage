import * as path from "path";
import type { StatusResult } from "simple-git";
import type { GitCommands, GitTrackedMode } from "../../src/types";
import type { Timeline } from "./timeline";

export class CountingGitCommands implements GitCommands {
  statusRuns = 0;
  private readonly held = new Map<string, Promise<void>>();

  constructor(
    private readonly counted: GitCommands,
    private readonly timeline: Timeline,
  ) {}

  status(repo: string): Promise<StatusResult> {
    this.statusRuns += 1;
    return this.timeline.span("status", () => this.counted.status(repo));
  }

  holdDiffsOf(file: string): () => void {
    let release = () => {};
    this.held.set(
      file,
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      this.held.delete(file);
      release();
    };
  }

  async diff(
    repo: string,
    file: string,
    mode: GitTrackedMode,
  ): Promise<string> {
    await this.held.get(path.join(repo, file));
    return this.timeline.span("diff", () =>
      this.counted.diff(repo, file, mode),
    );
  }

  lsFiles(repo: string): Promise<string> {
    return this.timeline.span("ls-files", () => this.counted.lsFiles(repo));
  }

  applyToIndex(repo: string, patch: string): Promise<void> {
    return this.counted.applyToIndex(repo, patch);
  }

  hashObject(repo: string, content: string): Promise<string> {
    return this.counted.hashObject(repo, content);
  }

  updateIndex(repo: string, file: string, hash: string): Promise<void> {
    return this.counted.updateIndex(repo, file, hash);
  }

  excludesFile(repo: string): Promise<string> {
    return this.timeline.span("config", () => this.counted.excludesFile(repo));
  }

  dispose(): Promise<void> {
    return this.counted.dispose();
  }
}
