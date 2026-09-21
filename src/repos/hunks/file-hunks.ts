import * as path from "path";
import { type Diff, type Git, type Hunk, GitTrackedMode } from "../../types";

export class FileHunks {
  private readonly byMode = new Map<GitTrackedMode, Promise<Diff>>();

  constructor(
    private readonly repo: string,
    private readonly file: string,
    private readonly git: Git,
  ) {}

  thatAre(mode: GitTrackedMode): Promise<Diff> {
    let diff = this.byMode.get(mode);
    if (diff === undefined) {
      diff = this.git.hunksFor(
        this.repo,
        path.relative(this.repo, this.file),
        mode,
      );
      this.byMode.set(mode, diff);
    }
    return diff;
  }

  async containing(line: number): Promise<Hunk | undefined> {
    const unstaged = await this.thatAre(GitTrackedMode.Unstaged);
    const hunk = unstaged.atOrBefore(line);
    return hunk !== undefined && line < hunk.start + Math.max(hunk.count, 1)
      ? hunk
      : undefined;
  }
}
