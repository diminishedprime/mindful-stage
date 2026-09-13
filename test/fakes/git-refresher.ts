import type { GitRefresher } from "../../src/types";

export class FakeGitRefresher implements GitRefresher {
  refreshes = 0;

  refresh(): void {
    this.refreshes += 1;
  }
}
