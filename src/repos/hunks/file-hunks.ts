import * as path from "path";
import { Ring } from "../../ring";
import {
  type Diff,
  Direction,
  type Git,
  type Hunk,
  GitTrackedMode,
} from "../../types";

export class FileHunks {
  private staged: Promise<Diff> | undefined;
  private unstaged: Promise<Diff> | undefined;

  constructor(
    private readonly repo: string,
    private readonly file: string,
    private readonly git: Git,
  ) {}

  thatAre(mode: GitTrackedMode): Promise<Diff> {
    return mode === GitTrackedMode.Staged
      ? this.stagedHunks()
      : this.unstagedHunks();
  }

  async containing(line: number): Promise<Hunk | undefined> {
    const unstaged = await this.unstagedHunks();
    const hunk = unstaged.atOrBefore(line);
    return hunk !== undefined && line < hunk.start + Math.max(hunk.count, 1)
      ? hunk
      : undefined;
  }

  private stagedHunks(): Promise<Diff> {
    this.staged ??= this.stagedInWorkingTree();
    return this.staged;
  }

  private unstagedHunks(): Promise<Diff> {
    this.unstaged ??= this.fromGit(GitTrackedMode.Unstaged);
    return this.unstaged;
  }

  private fromGit(mode: GitTrackedMode): Promise<Diff> {
    return this.git.hunksFor(
      this.repo,
      path.relative(this.repo, this.file),
      mode,
    );
  }

  private async stagedInWorkingTree(): Promise<Diff> {
    const [staged, unstaged] = await Promise.all([
      this.fromGit(GitTrackedMode.Staged),
      this.unstagedHunks(),
    ]);
    const moved = Array.from(staged.all(Direction.Next), (hunk) => ({
      ...hunk,
      start: FileHunks.inWorkingTree(hunk.start, unstaged),
    }));
    return Ring.keyed(moved, (hunk) => hunk.start);
  }

  private static inWorkingTree(line: number, unstaged: Diff): number {
    let shift = 0;
    for (const hunk of unstaged.all(Direction.Next)) {
      const { oldStart, oldLines, newLines } = hunk.chunk;
      if (line >= oldStart + Math.max(oldLines, 1)) {
        shift += newLines - oldLines;
        continue;
      }
      return Math.min(line + shift, hunk.start);
    }
    return line + shift;
  }
}
