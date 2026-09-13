import type { GitRefresher } from "../../src/types";

export class FakeGitRefresher implements GitRefresher {
  refreshed: string[] = [];

  refresh(repo: string): void {
    this.refreshed.push(repo);
  }
}
