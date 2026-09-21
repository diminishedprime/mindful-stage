import * as path from "path";
import { inject, injectable } from "tsyringe";
import { EDITOR, NOTIFIER, REPOS } from "./di-tokens";
import { Repos } from "./repos";
import type { AtCursor, Editor, Notifier } from "./types";

@injectable()
export class GitStager {
  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(NOTIFIER) private readonly notifier: Notifier,
    @inject(REPOS) private readonly repos: Repos,
  ) {}

  async stageHunkAtCursor(): Promise<void> {
    const cursor = await this.atCursor();
    if (cursor === undefined) {
      return;
    }
    const hunk = await cursor.repo.hunkContaining(
      cursor.active.path,
      cursor.active.line,
    );
    if (hunk === undefined) {
      this.notifier.notify("no unstaged hunk at cursor");
      return;
    }
    await cursor.repo.stage(hunk);
  }

  async startTracking(): Promise<void> {
    const cursor = await this.atCursor();
    if (cursor === undefined) {
      return;
    }
    if (!(await cursor.repo.startTracking(cursor.active.path))) {
      this.notifier.error(
        `'${path.basename(cursor.active.path)}' is already tracked`,
      );
    }
  }

  private async atCursor(): Promise<AtCursor | undefined> {
    const cursor = this.editor.active();
    if (cursor.kind === "nowhere") {
      this.notifier.notify("no active editor");
      return undefined;
    }
    await this.repos.discovered();
    const repo = this.repos.findRepoContaining(cursor.at.path);
    if (repo === undefined) {
      this.notifier.notify("not inside a repo");
      return undefined;
    }
    return { active: cursor.at, repo };
  }
}
