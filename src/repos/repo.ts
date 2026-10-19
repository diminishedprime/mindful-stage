import * as path from "path";
import type { FileStatusResult } from "simple-git";
import { NothingToDo } from "../errors";
import { Ring } from "../ring";
import {
  type Changes,
  type Diff,
  type Fs,
  type Git,
  type Hunk,
  GitTrackedMode,
  StatusCode,
} from "../types";
import { type Completed, type Failed, Refresher } from "../util/refresher";
import { Hunks } from "./hunks";

export class Repo {
  private static readonly COMMON_README_FILENAMES: readonly string[] = [
    "readme.md",
    "readme.markdown",
    "readme.rst",
    "readme.org",
    "readme.txt",
    "readme",
  ] as const;

  readonly status: Refresher<Changes>;
  private readonly hunks: Hunks;

  constructor(
    readonly path: string,
    private readonly fs: Fs,
    private readonly git: Git,
    completed: Completed<Changes>,
    failed: Failed,
  ) {
    this.status = new Refresher(() => this.statusOf(), completed, failed);
    this.hunks = new Hunks(path, git);
  }

  hunksIn(file: string, mode: GitTrackedMode): Promise<Diff> {
    return this.hunks.forFile(file).thatAre(mode);
  }

  hunkContaining(file: string, line: number): Promise<Hunk | undefined> {
    return this.hunks.forFile(file).containing(line);
  }

  async stage(hunk: Hunk): Promise<void> {
    await this.git.stage(this.path, hunk);
  }

  async startTracking(file: string): Promise<void> {
    const fresh = await this.status.fresh();
    if (!fresh.untracked.has(file)) {
      throw new NothingToDo(`'${path.basename(file)}' is already tracked`);
    }
    const content = new TextDecoder().decode(
      await this.fs.promises.readFile(file),
    );
    const newline = content.indexOf("\n");
    const firstLine = newline === -1 ? content : content.slice(0, newline + 1);
    const hash = await this.git.hashObject(this.path, firstLine);
    await this.git.addToIndex(this.path, path.relative(this.path, file), hash);
  }

  fileTouched(file: string): void {
    this.hunks.invalidateFile(file);
    this.status.rerun();
  }

  gitDirTouched(): void {
    this.hunks.invalidateRepo();
    this.status.rerun();
  }

  private async statusOf(): Promise<Changes> {
    const [{ files, not_added, ahead, tracking }, fallback] = await Promise.all(
      [this.git.statusFor(this.path), this.fallback()],
    );
    const ordered = Repo.ordered(files, not_added.length);
    const remaining: Partial<Record<StatusCode, number>> = {};
    const unstaged: string[] = [];
    const staged: string[] = [];
    const deleted = new Set<string>();
    const untracked = new Set<string>();
    for (const { path: file, index, working_dir } of ordered) {
      const absolute = path.join(this.path, file);
      if (working_dir !== " ") {
        const code = working_dir as StatusCode;
        remaining[code] = (remaining[code] ?? 0) + 1;
        unstaged.push(absolute);
        if (working_dir === "D") {
          deleted.add(absolute);
        } else if (working_dir === "?") {
          untracked.add(absolute);
        }
      }
      if (index !== " " && index !== "?") {
        staged.push(absolute);
      }
    }
    const unopenable = await this.unopenableAmong([...unstaged, ...staged]);
    return {
      [GitTrackedMode.Unstaged]: unstaged,
      [GitTrackedMode.Staged]: staged,
      stops: {
        [GitTrackedMode.Unstaged]: Repo.stops(unstaged, unopenable, fallback),
        [GitTrackedMode.Staged]: Repo.stops(staged, unopenable, fallback),
      },
      unopenable: {
        [GitTrackedMode.Unstaged]: unstaged.filter((file) =>
          unopenable.has(file),
        ).length,
        [GitTrackedMode.Staged]: staged.filter((file) => unopenable.has(file))
          .length,
      },
      fallback,
      untracked,
      deleted,
      remaining,
      ahead,
      upstream: tracking !== null,
    };
  }

  private async isBinary(file: string): Promise<boolean> {
    await using handle = await this.fs.promises.open(file);
    const { bytesRead, buffer } = await handle.read(
      Buffer.alloc(8000),
      0,
      8000,
      0,
    );
    return buffer.subarray(0, bytesRead).includes(0);
  }

  private async canOpen(file: string): Promise<boolean> {
    try {
      return !(await this.isBinary(file));
    } catch {
      return false;
    }
  }

  private async unopenableAmong(files: string[]): Promise<Set<string>> {
    const unopenable = new Set<string>();
    for (const file of new Set(files)) {
      const canOpen = await this.canOpen(file);
      if (canOpen === false) {
        unopenable.add(file);
      }
    }
    return unopenable;
  }

  private async fallback(): Promise<string | undefined> {
    const tracked = await this.git.trackedFilesFor(this.path);
    const readme = Repo.findReadme(tracked);
    if (readme !== undefined) {
      const candidate = path.join(this.path, readme);
      if (await this.canOpen(candidate)) {
        return candidate;
      }
    }
    for (const file of tracked) {
      const candidate = path.join(this.path, file);
      if (await this.canOpen(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private static findReadme(tracked: string[]): string | undefined {
    return tracked.find((file) =>
      Repo.COMMON_README_FILENAMES.includes(file.toLowerCase()),
    );
  }

  private static stops(
    files: string[],
    unopenable: Set<string>,
    fallback: string | undefined,
  ): Ring<string> {
    const ordinary = files.filter(
      (file) => !unopenable.has(file) && file !== fallback,
    );
    const last =
      files.some((file) => file === fallback || unopenable.has(file)) &&
      // Stryker disable next-line ConditionalExpression: only narrows the type, this mutant wouldn't compile if we type checked mutants
      fallback !== undefined
        ? [fallback]
        : [];
    return Ring.keyed([...ordinary, ...last], (file) =>
      file === fallback ? `1${file}` : `0${file}`,
    );
  }

  // Just some fun fanciness. Since we know that git output is already sorted,
  // but that the unstaged are sorted at the end, we do a fancy lil inline merge
  // sort here. I knew learning cs stuff would come in handy lol.
  private static ordered(
    files: FileStatusResult[],
    untracked: number,
  ): FileStatusResult[] {
    const boundary = files.length - untracked;
    let i = 0;
    let j = boundary;
    return files.map(() => {
      if (j >= files.length) {
        return files[i++]!;
      }
      if (i >= boundary) {
        return files[j++]!;
      }
      // Stryker disable next-line EqualityOperator: a tracked and an untracked file never share a path
      return files[i]!.path < files[j]!.path ? files[i++]! : files[j++]!;
    });
  }
}
