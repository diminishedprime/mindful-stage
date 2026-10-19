import {
  Change,
  type Composition,
  Deletion,
  type Mark,
  type MarkedChange,
  type Wedge,
} from "../../types";

export class MarkedLines {
  private readonly changes = new Map<number, MarkedChange>();
  private readonly aboves = new Map<number, Wedge>();
  private readonly belows = new Map<number, Wedge>();

  changed(lines: number[], change: MarkedChange): void {
    for (const line of lines) {
      this.changes.set(line, change);
    }
  }

  deletedAbove(lines: number[], deletion: Wedge): void {
    for (const line of lines) {
      this.aboves.set(line, deletion);
    }
  }

  deletedBelow(lines: number[], deletion: Wedge): void {
    for (const line of lines) {
      this.belows.set(line, deletion);
    }
  }

  compositions(): Composition[] {
    const marks = new Map<number, Mark>();
    for (const [line, below] of this.belows) {
      marks.set(line, `${Change.Nothing}/${Deletion.Nothing}/${below}`);
    }
    for (const [line, above] of this.aboves) {
      marks.set(line, `${Change.Nothing}/${above}/${this.belowOf(line)}`);
    }
    for (const [line, change] of this.changes) {
      marks.set(line, `${change}/${this.aboveOf(line)}/${this.belowOf(line)}`);
    }
    return Array.from(
      Map.groupBy(marks, ([, mark]) => mark),
      ([mark, lines]) => ({ mark, lines: lines.map(([line]) => line) }),
    );
  }

  private aboveOf(line: number): Deletion {
    return this.aboves.get(line) ?? Deletion.Nothing;
  }

  private belowOf(line: number): Deletion {
    return this.belows.get(line) ?? Deletion.Nothing;
  }
}
