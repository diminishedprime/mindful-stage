import type { Change, Composition, Decorations } from "../../src/types";

export class FakeDecorations implements Decorations {
  private byFile = new Map<string, Composition[]>();

  render(file: string, compositions: Composition[]): void {
    this.byFile.set(file, compositions);
  }

  linesMarked(file: string, change: Change): number[] {
    const lines: number[] = [];
    for (const composition of this.byFile.get(file) ?? []) {
      if (composition.mark.change === change) {
        lines.push(...composition.lines);
      }
    }
    return lines.sort((a, b) => a - b);
  }

  anythingMarked(file: string): boolean {
    return (this.byFile.get(file) ?? []).length > 0;
  }

  async recolor(): Promise<void> {}

  async dispose(): Promise<void> {}
}
