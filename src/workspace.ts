import { inject, injectable } from "tsyringe";
import { REPOS } from "./di-tokens";
import { Repos } from "./repos";
import type { Repo } from "./repos/repo";
import type { Ring } from "./ring";
import {
  type Cursor,
  DestinationKind,
  Direction,
  type FileDestination,
  GitTrackedMode,
} from "./types";

type Home = { repo: Repo; file: string; line: number };

@injectable()
export class Workspace {
  constructor(@inject(REPOS) private readonly repos: Repos) {}

  stepRepo(
    cursor: Cursor,
    direction: Direction,
  ): Promise<FileDestination | undefined> {
    const home = this.homeFor(cursor);
    return this.firstFileIn(
      this.reposFrom(home, direction),
      direction,
      GitTrackedMode.Staged,
    );
  }

  stepFile(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination | undefined> {
    return this.fileFrom(this.homeFor(cursor), direction, mode);
  }

  async stepHunk(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination | undefined> {
    const home = this.homeFor(cursor);
    const beyond = await this.hunkBeyond(home, direction, mode);
    if (beyond !== undefined) {
      return beyond;
    }
    const next = await this.fileFrom(home, direction, mode);
    if (next === undefined) {
      return undefined;
    }
    return this.firstHunkIn(next.file, direction, mode);
  }

  private async hunkBeyond(
    home: Home | undefined,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination | undefined> {
    if (home === undefined) {
      return undefined;
    }
    const hunks = await home.repo.hunksIn(home.file, mode);
    const line = hunks.beyond(home.line, direction)?.start;
    if (line === undefined) {
      return undefined;
    }
    return { kind: DestinationKind.File, file: home.file, line };
  }

  private async firstHunkIn(
    file: string,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination> {
    const hunks = await this.repos.repoContaining(file).hunksIn(file, mode);
    return {
      kind: DestinationKind.File,
      file,
      line: hunks.first(direction)?.start ?? 1,
    };
  }

  private async fileFrom(
    home: Home | undefined,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination | undefined> {
    if (home !== undefined) {
      const here = await this.filesOf(home.repo.path, mode);
      const beyond = here.beyond(here.keyOf(home.file), direction);
      if (beyond !== undefined) {
        return { kind: DestinationKind.File, file: beyond, line: 1 };
      }
    }
    return this.firstFileIn(this.reposFrom(home, direction), direction, mode);
  }

  private reposFrom(
    home: Home | undefined,
    direction: Direction,
  ): Iterable<string> {
    const ring = this.repos.ring();
    if (home === undefined) {
      return ring.all(direction);
    }
    return ring.after(home.repo.path, direction);
  }

  private async firstFileIn(
    repos: Iterable<string>,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<FileDestination | undefined> {
    for (const repo of repos) {
      const file = (await this.filesOf(repo, mode)).first(direction);
      if (file !== undefined) {
        return { kind: DestinationKind.File, file, line: 1 };
      }
    }
    return undefined;
  }

  private homeFor(cursor: Cursor): Home | undefined {
    if (cursor.kind === "nowhere") {
      return undefined;
    }
    const repo = this.repos.findRepoContaining(cursor.at.path);
    if (repo === undefined) {
      return undefined;
    }
    return { repo, file: cursor.at.path, line: cursor.at.line };
  }

  private async filesOf(
    repo: string,
    mode: GitTrackedMode,
  ): Promise<Ring<string>> {
    return (await this.repos.byPath(repo).status.value()).stops[mode];
  }
}
