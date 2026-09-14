import * as fs from "fs/promises";
import * as path from "path";
import type { FileStatusResult } from "simple-git";
import { Ring } from "../ring";
import {
  type Changes,
  type Diff,
  type Git,
  type GitRefresher,
  type Hunk,
  Mode,
  StatusCode,
} from "../types";
import { type Completed, Refresher } from "../util/refresher";
import { Hunks } from "./hunks";

export class Repo {
  readonly status: Refresher<Changes>;
  private readonly hunks: Hunks;

  constructor(
    readonly path: string,
    private readonly git: Git,
    private readonly refresher: GitRefresher,
    completed: Completed<Changes>,
  ) {
    this.status = new Refresher(() => this.statusOf(), completed);
    this.hunks = new Hunks(path, git);
  }

  hunksIn(file: string, mode: Mode): Promise<Diff> {
    return this.hunks.forFile(file).thatAre(mode);
  }

  hunkContaining(file: string, line: number): Promise<Hunk | undefined> {
    return this.hunks.forFile(file).containing(line);
  }

  async stage(hunk: Hunk): Promise<void> {
    await this.git.stage(this.path, hunk);
    this.hunks.invalidateFile(path.join(this.path, hunk.to));
    this.refresher.refresh(this.path);
  }

  async startTracking(file: string): Promise<boolean> {
    const fresh = await this.status.fresh();
    if (!fresh.untracked.has(file)) {
      return false;
    }
    const content = await fs.readFile(file, "utf8");
    const newline = content.indexOf("\n");
    const firstLine = newline === -1 ? content : content.slice(0, newline + 1);
    const hash = await this.git.hashObject(this.path, firstLine);
    await this.git.addToIndex(this.path, path.relative(this.path, file), hash);
    this.hunks.invalidateFile(file);
    this.refresher.refresh(this.path);
    return true;
  }

  fileTouched(file: string): Promise<void> {
    this.hunks.invalidateFile(file);
    return this.status.rerun();
  }

  gitDirTouched(): Promise<void> {
    this.hunks.invalidateRepo();
    return this.status.rerun();
  }

  private async statusOf(): Promise<Changes> {
    const { files, not_added, ahead, tracking } = await this.git.status(
      this.path,
    );
    const ordered = Repo.ordered(files, not_added.length);
    const remaining: Partial<Record<StatusCode, number>> = {};
    const relativeUnstaged: string[] = [];
    let unstaged: string[] = [];
    let staged: string[] = [];
    const deleted = new Set<string>();
    const untracked = new Set<string>();
    for (const { path: file, index, working_dir } of ordered) {
      const absolute = path.join(this.path, file);
      if (working_dir !== " ") {
        const code = working_dir as StatusCode;
        remaining[code] = (remaining[code] ?? 0) + 1;
        relativeUnstaged.push(file);
        unstaged.push(absolute);
        if (working_dir === "D") {
          deleted.add(absolute);
        } else if (working_dir === "?") {
          untracked.add(absolute);
        }
      }
      if (index !== " " && index !== "?" && index !== "D") {
        staged.push(absolute);
      }
    }
    if (relativeUnstaged.length > 0) {
      const lfs = await this.git.lfsPaths(this.path, relativeUnstaged);
      if (lfs.size > 0) {
        const excluded = new Set(
          [...lfs].map((file) => path.join(this.path, file)),
        );
        for (const file of excluded) {
          deleted.delete(file);
          untracked.delete(file);
        }
        unstaged = unstaged.filter((file) => !excluded.has(file));
        staged = staged.filter((file) => !excluded.has(file));
      }
    }
    return {
      [Mode.Unstaged]: Ring.of(unstaged),
      [Mode.Staged]: Ring.of(staged),
      untracked,
      deleted,
      remaining,
      ahead,
      upstream: tracking !== null,
    };
  }

  // Just some fun fanciness. Since we know that git output is already sorted,
  // but that the unstaged are sorted at the end, we do a fancy lil inline merge
  // sort here. I knew learning cs stuff would come in handy lol.
  private static ordered(
    files: FileStatusResult[],
    untracked: number,
  ): FileStatusResult[] {
    const boundary = files.length - untracked;
    const ordered: FileStatusResult[] = [];
    let i = 0;
    let j = boundary;
    while (i < boundary && j < files.length) {
      ordered.push(files[i]!.path < files[j]!.path ? files[i++]! : files[j++]!);
    }
    while (i < boundary) {
      ordered.push(files[i++]!);
    }
    while (j < files.length) {
      ordered.push(files[j++]!);
    }
    return ordered;
  }
}
