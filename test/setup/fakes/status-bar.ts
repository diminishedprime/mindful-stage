import type { StatusBar } from "../../../src/types";

export class FakeStatusBar implements StatusBar {
  summaries: string[] = [];
  clickRuns: string | undefined;

  get summary(): string | undefined {
    return this.summaries.at(-1);
  }

  show(summary: string): void {
    this.summaries.push(summary);
  }

  whenClicked(command: string): void {
    this.clickRuns = command;
  }

  async dispose(): Promise<void> {}
}
