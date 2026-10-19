import * as path from "path";
import { inject, injectable } from "tsyringe";
import BTree from "sorted-btree";
import { REPOS, WORKSPACE_FOLDERS, STATUS_BAR } from "../di-tokens";
import { Repos } from "../repos";
import { Summary } from "./summary";
import type { Changes, Choice, RepoListener, StatusBar } from "../types";

@injectable()
export class Tally implements RepoListener {
  private readonly summaries = new BTree<string, Summary>();
  private total = Summary.none();

  constructor(
    @inject(STATUS_BAR) private readonly statusBar: StatusBar,
    @inject(WORKSPACE_FOLDERS) private readonly workspaceFolders: string[],
    @inject(REPOS) repos: Repos,
  ) {
    repos.subscribe(this);
  }

  choices(): Choice[] {
    const choices: Choice[] = [];
    for (const [repo, summary] of this.summaries.entries()) {
      const work = summary.plain();
      if (work !== "") {
        choices.push({ label: this.label(repo), description: work, repo });
      }
    }
    return choices;
  }

  refreshed(repo: string, changes: Changes): void {
    const previous = this.summaries.get(repo) ?? Summary.none();
    const next = Summary.of(changes);
    this.summaries.set(repo, next);
    this.total = this.total.minus(previous).plus(next);
    this.show();
  }

  removed(repo: string): void {
    const gone = this.summaries.get(repo) ?? Summary.none();
    this.summaries.delete(repo);
    this.total = this.total.minus(gone);
    this.show();
  }

  async initializing(starting: Promise<void>): Promise<void> {
    this.statusBar.show("initializing...");
    await starting;
    this.show();
  }

  private show(): void {
    this.statusBar.show(this.total.terse());
  }

  private label(repo: string): string {
    const relative = this.workspaceFolders
      .map((folder) => path.relative(folder, repo))
      .find((inside) => !inside.startsWith(".."));
    return relative || path.basename(repo);
  }
}
