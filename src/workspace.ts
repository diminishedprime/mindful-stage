import { inject, injectable } from "tsyringe";
import { REPOS } from "./di-tokens";
import { Repos } from "./repos";
import type { Ring } from "./ring";
import {
  DestinationKind,
  Direction,
  Mode,
  type Position,
  type ResolvedDestination,
} from "./types";

@injectable()
export class Workspace {
  constructor(@inject(REPOS) private readonly repos: Repos) {}

  stepRepo(
    cursor: string | undefined,
    direction: Direction,
    mode: Mode,
  ): Promise<string | undefined> {
    const home = this.repoForCursor(cursor);
    const ring = this.repos.ring();
    const keyWalk =
      home === undefined ? ring.all(direction) : ring.after(home, direction);
    const getRingByKey = (repo: string) => this.filesOf(repo, mode);

    return this.firstStop(keyWalk, getRingByKey, direction);
  }

  stepFile(
    cursor: string | undefined,
    direction: Direction,
    mode: Mode,
  ): Promise<string | undefined> {
    const home = this.repoForCursor(cursor);
    const ring = this.repos.ring();
    const keyWalk =
      home === undefined ? ring.all(direction) : ring.from(home, direction);
    const startBeyond = home === undefined ? undefined : cursor;
    const getRingByKey = (repo: string) => this.filesOf(repo, mode);

    return this.firstStop(keyWalk, getRingByKey, direction, startBeyond);
  }

  async stepHunk(
    cursor: Position,
    direction: Direction,
    mode: Mode,
  ): Promise<ResolvedDestination | undefined> {
    const here = await this.repos.repoContaining(cursor.path).hunksIn(cursor.path, mode);
    const line = here.beyond(cursor.line, direction)?.start;
    if (line !== undefined) {
      return { kind: DestinationKind.Hunk, file: cursor.path, line };
    }
    const file = await this.stepFile(cursor.path, direction, mode);
    if (file === undefined) {
      return undefined;
    }
    const first = (await this.repos.repoContaining(file).hunksIn(file, mode)).first(
      direction,
    )?.start;
    return first === undefined
      ? { kind: DestinationKind.File, file }
      : { kind: DestinationKind.Hunk, file, line: first };
  }

  private async firstStop<
    Key extends string | number,
    Item extends string | number,
  >(
    keyWalk: Iterable<Key>,
    getRingByKey: (key: Key) => Promise<Ring<Item, Item>>,
    direction: Direction,
    startBeyond?: Item,
  ): Promise<Item | undefined> {
    let first = true;
    for (const key of keyWalk) {
      const ring = await getRingByKey(key);
      const item =
        first && startBeyond !== undefined
          ? ring.beyond(startBeyond, direction)
          : ring.first(direction);
      first = false;
      if (item !== undefined) {
        return item;
      }
    }
    return undefined;
  }

  private repoForCursor(cursor: string | undefined): string | undefined {
    return cursor === undefined ? undefined : this.repos.findRepoContaining(cursor)?.path;
  }

  private async filesOf(repo: string, mode: Mode): Promise<Ring<string>> {
    return (await this.repos.byPath(repo).status.value())[mode];
  }
}
