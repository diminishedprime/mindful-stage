import type { StatusBar } from "../../src/types";

export class FakeStatusBar implements StatusBar {
  summaries: string[] = [];

  get summary(): string | undefined {
    return this.summaries.at(-1);
  }

  show(summary: string): void {
    this.summaries.push(summary);
  }

  async dispose(): Promise<void> {}
}
