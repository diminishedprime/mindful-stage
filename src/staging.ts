import * as path from "path";
import { inject, injectable } from "tsyringe";
import { EDITOR, REPOS } from "./di-tokens";
import { NothingToDo } from "./errors";
import { Repos } from "./repos";
import type { AtCursor, Editor } from "./types";

@injectable()
export class GitStager {
  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(REPOS) private readonly repos: Repos,
  ) {}

  async stageHunkAtCursor(): Promise<void> {
    const cursor = await this.atCursor();
    this.requireSaved(cursor.active.path, "staging");
    const hunk = await cursor.repo.hunkContaining(
      cursor.active.path,
      cursor.active.line,
    );
    if (hunk === undefined) {
      throw new NothingToDo("no unstaged hunk at cursor");
    }
    await cursor.repo.stage(hunk);
  }

  async startTracking(): Promise<void> {
    const cursor = await this.atCursor();
    this.requireSaved(cursor.active.path, "tracking");
    await cursor.repo.startTracking(cursor.active.path);
  }

  private requireSaved(file: string, doing: string): void {
    if (this.editor.isDirty(file)) {
      throw new NothingToDo(`save ${path.basename(file)} before ${doing} it`);
    }
  }

  private async atCursor(): Promise<AtCursor> {
    const cursor = this.editor.active();
    if (cursor.kind === "nowhere") {
      throw new NothingToDo("no active editor");
    }
    const repo = this.repos.findRepoContaining(cursor.at.path);
    if (repo === undefined) {
      throw new NothingToDo("not inside a repo");
    }
    return { active: cursor.at, repo };
  }
}
