import { Change, type Composition, Deletion, type Mark } from "../../types";

export class MarkedLines {
  private readonly changes = new Map<number, Change>();
  private readonly aboves = new Map<number, Deletion>();
  private readonly belows = new Map<number, Deletion>();

  changed(lines: number[], change: Change): void {
    for (const line of lines) {
      this.changes.set(line, change);
    }
  }

  deletedAbove(lines: number[], deletion: Deletion): void {
    for (const line of lines) {
      this.aboves.set(line, deletion);
    }
  }

  deletedBelow(lines: number[], deletion: Deletion): void {
    for (const line of lines) {
      this.belows.set(line, deletion);
    }
  }

  compositions(): Composition[] {
    const byMark = new Map<string, Composition>();
    for (const line of this.marked()) {
      const mark: Mark = {
        change: this.changes.get(line) ?? Change.Nothing,
        above: this.aboves.get(line) ?? Deletion.Nothing,
        below: this.belows.get(line) ?? Deletion.Nothing,
      };
      const key = `${mark.change}/${mark.above}/${mark.below}`;
      const composition = byMark.get(key) ?? { mark, lines: [] };
      composition.lines.push(line);
      byMark.set(key, composition);
    }
    return [...byMark.values()];
  }

  private marked(): Set<number> {
    return new Set([
      ...this.changes.keys(),
      ...this.aboves.keys(),
      ...this.belows.keys(),
    ]);
  }
}
