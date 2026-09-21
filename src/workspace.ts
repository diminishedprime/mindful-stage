import { inject, injectable } from "tsyringe";
import { REPOS } from "./di-tokens";
import { Repos } from "./repos";
import type { Ring } from "./ring";
import {
  type Cursor,
  DestinationKind,
  Direction,
  GitTrackedMode,
  type ResolvedDestination,
} from "./types";

type Home = { repo: string; file: string };

@injectable()
export class Workspace {
  constructor(@inject(REPOS) private readonly repos: Repos) {}

  stepRepo(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<string | undefined> {
    const home = this.homeFor(cursor);
    const ring = this.repos.ring();
    if (home === undefined) {
      return this.firstFileIn(ring.all(direction), direction, mode);
    }
    return this.firstFileIn(ring.after(home.repo, direction), direction, mode);
  }

  stepFile(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<string | undefined> {
    const home = this.homeFor(cursor);
    if (home === undefined) {
      return this.firstFileIn(
        this.repos.ring().all(direction),
        direction,
        mode,
      );
    }
    return this.fileAfter(home, direction, mode);
  }

  async stepHunk(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<ResolvedDestination | undefined> {
    const beyond = await this.hunkBeyondCursor(cursor, direction, mode);
    if (beyond !== undefined) {
      return beyond;
    }
    const file = await this.stepFile(cursor, direction, mode);
    if (file === undefined) {
      return undefined;
    }
    return this.firstHunkIn(file, direction, mode);
  }

  private async hunkBeyondCursor(
    cursor: Cursor,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<ResolvedDestination | undefined> {
    if (cursor.kind === "nowhere") {
      return undefined;
    }
    const repo = this.repos.findRepoContaining(cursor.at.path);
    if (repo === undefined) {
      return undefined;
    }
    const hunks = await repo.hunksIn(cursor.at.path, mode);
    const line = hunks.beyond(cursor.at.line, direction)?.start;
    if (line === undefined) {
      return undefined;
    }
    return { kind: DestinationKind.Hunk, file: cursor.at.path, line };
  }

  private async firstHunkIn(
    file: string,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<ResolvedDestination> {
    const hunks = await this.repos.repoContaining(file).hunksIn(file, mode);
    const line = hunks.first(direction)?.start;
    if (line === undefined) {
      return { kind: DestinationKind.File, file };
    }
    return { kind: DestinationKind.Hunk, file, line };
  }

  private async fileAfter(
    home: Home,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<string | undefined> {
    const here = await this.filesOf(home.repo, mode);
    const beyond = here.beyond(home.file, direction);
    if (beyond !== undefined) {
      return beyond;
    }
    return this.firstFileIn(
      this.repos.ring().after(home.repo, direction),
      direction,
      mode,
    );
  }

  private async firstFileIn(
    repos: Iterable<string>,
    direction: Direction,
    mode: GitTrackedMode,
  ): Promise<string | undefined> {
    for (const repo of repos) {
      const file = (await this.filesOf(repo, mode)).first(direction);
      if (file !== undefined) {
        return file;
      }
    }
    return undefined;
  }

  private homeFor(cursor: Cursor): Home | undefined {
    if (cursor.kind === "nowhere") {
      return undefined;
    }
    const repo = this.repos.findRepoContaining(cursor.at.path)?.path;
    if (repo === undefined) {
      return undefined;
    }
    return { repo, file: cursor.at.path };
  }

  private async filesOf(
    repo: string,
    mode: GitTrackedMode,
  ): Promise<Ring<string>> {
    return (await this.repos.byPath(repo).status.value())[mode];
  }
}
