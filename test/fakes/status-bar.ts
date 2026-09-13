import type { StatusBar } from "../../src/types";

export class FakeStatusBar implements StatusBar {
  summaries: string[] = [];
  details: string[] = [];

  get summary(): string | undefined {
    return this.summaries.at(-1);
  }

  get detail(): string | undefined {
    return this.details.at(-1);
  }

  show(summary: string, detail: string): void {
    this.summaries.push(summary);
    this.details.push(detail);
  }

  async dispose(): Promise<void> {}
}
