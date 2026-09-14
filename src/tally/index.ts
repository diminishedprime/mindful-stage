import * as path from "path";
import { inject, injectable } from "tsyringe";
import BTree from "sorted-btree";
import { REPOS, WORKSPACE_FOLDERS, STATUS_BAR } from "../di-tokens";
import { Summary } from "./summary";
import type { Changes, Choice, RepoListener, StatusBar } from "../types";

@injectable()
export class Tally implements RepoListener {
  private static readonly CATCH_UP_MS = 5 * 60 * 1000;

  private readonly summaries = new BTree<string, Summary>();
  private total = Summary.none();
  private readonly catchUp: NodeJS.Timeout;

  constructor(
    @inject(STATUS_BAR) private readonly statusBar: StatusBar,
    @inject(WORKSPACE_FOLDERS) private readonly workspaceFolders: string[],
  ) {
    this.catchUp = setInterval(() => this.reconcile(), Tally.CATCH_UP_MS);
    this.catchUp.unref();
  }

  choices(): Choice[] {
    const choices: Choice[] = [];
    for (const [repo, summary] of this.summaries.entries()) {
      const detail = summary.plain();
      if (detail !== "") {
        choices.push({ label: this.label(repo), detail, repo });
      }
    }
    return choices;
  }

  anyStaged(): boolean {
    return this.total.anyStaged;
  }

  reconcile(): void {
    this.total = Summary.sum(
      Array.from(this.summaries.values(), (summary) => summary.asOneRepo()),
    );
    this.show();
  }

  async dispose(): Promise<void> {
    clearInterval(this.catchUp);
    await this.statusBar.dispose();
  }

  refreshed(repo: string, changes: Changes): void {
    const previous = this.summaries.get(repo) ?? Summary.none();
    const next = Summary.of(changes);
    this.summaries.set(repo, next);
    this.total = this.total.minus(previous.asOneRepo()).plus(next.asOneRepo());
    this.show();
  }

  removed(repo: string): void {
    const gone = this.summaries.get(repo) ?? Summary.none();
    this.summaries.delete(repo);
    this.total = this.total.minus(gone.asOneRepo());
    this.show();
  }

  private show(): void {
    this.statusBar.show(this.total.terse(), this.detail());
  }

  private detail(): string {
    const rows = this.choices().map(
      ({ label, detail }) => `- \`${label}\` ${detail}`,
    );
    if (rows.length === 0) {
      return "No outstanding changes.";
    }
    return rows.join("\n");
  }

  private label(repo: string): string {
    const workspaceFolder = this.workspaceFolders.find((r) =>
      repo.startsWith(r + path.sep),
    );
    if (workspaceFolder === undefined) {
      return repo;
    }
    return path.relative(workspaceFolder, repo);
  }
}
