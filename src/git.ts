import type { StatusResult } from "simple-git";
import parseDiff from "parse-diff";
import { inject, injectable } from "tsyringe";
import { GIT_COMMANDS } from "./di-tokens";
import { Ring } from "./ring";
import {
  type Diff,
  type Git,
  type GitCommands,
  type Hunk,
  type GitTrackedMode,
} from "./types";

@injectable()
export class SimpleGitClient implements Git {
  constructor(@inject(GIT_COMMANDS) private readonly commands: GitCommands) {}

  statusFor(repo: string): Promise<StatusResult> {
    return this.commands.status(repo);
  }

  async hunksFor(
    repo: string,
    file: string,
    mode: GitTrackedMode,
  ): Promise<Diff> {
    const diff = await this.commands.diff(repo, file, mode);
    const all = parseDiff(diff).flatMap((f) =>
      f.chunks.map((chunk) => ({
        start: chunk.newLines === 0 ? chunk.newStart + 1 : chunk.newStart,
        count: chunk.newLines,
        from: f.from!,
        to: f.to!,
        chunk,
      })),
    );
    return Ring.keyed(all, (hunk) => hunk.start);
  }

  async stage(repo: string, hunk: Hunk): Promise<void> {
    await this.commands.applyToIndex(repo, SimpleGitClient.patchFor(hunk));
  }

  async trackedFilesFor(repo: string): Promise<string[]> {
    return (await this.commands.lsFiles(repo)).split("\0");
  }

  async hashObject(repo: string, content: string): Promise<string> {
    return (await this.commands.hashObject(repo, content)).trim();
  }

  async addToIndex(repo: string, file: string, hash: string): Promise<void> {
    await this.commands.updateIndex(repo, file, hash);
  }

  async excludesFileFor(repo: string): Promise<string> {
    return (await this.commands.excludesFile(repo)).trim();
  }

  private static patchFor(hunk: Hunk): string {
    return [
      `--- a/${hunk.from}`,
      `+++ b/${hunk.to}`,
      hunk.chunk.content,
      ...hunk.chunk.changes.map((change) => change.content),
      "",
    ].join("\n");
  }
}
