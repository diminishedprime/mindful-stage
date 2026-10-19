import { injectable } from "tsyringe";
import {
  Change,
  type Composition,
  Deletion,
  GitTrackedMode,
  type Marks,
  type Span,
  UNTRACKED,
} from "../../types";
import { range } from "../../util/range";
import { MarkedLines } from "./marked-lines";

@injectable()
export class Compositor {
  compose(marks: Marks, lineCount: number): Composition[] {
    const untracked = marks[UNTRACKED];
    if (untracked.length > 0) {
      return [
        {
          mark: `${Change.Untracked}/${Deletion.Nothing}/${Deletion.Nothing}`,
          lines: this.changedLines(untracked, lineCount),
        },
      ];
    }
    const staged = marks[GitTrackedMode.Staged];
    const unstaged = marks[GitTrackedMode.Unstaged];
    const marked = new MarkedLines();

    marked.changed(this.changedLines(staged, lineCount), Change.Staged);
    marked.changed(this.changedLines(unstaged, lineCount), Change.Unstaged);
    marked.deletedAbove(this.aboveLines(staged, lineCount), Deletion.Staged);
    marked.deletedAbove(
      this.aboveLines(unstaged, lineCount),
      Deletion.Unstaged,
    );
    marked.deletedBelow(this.belowLines(staged, lineCount), Deletion.Staged);
    marked.deletedBelow(
      this.belowLines(unstaged, lineCount),
      Deletion.Unstaged,
    );

    return marked.compositions();
  }

  private changedLines(spans: Span[], lineCount: number): number[] {
    return spans.flatMap(({ start, count }) =>
      range(start, count).map((line) => this.clamp(line, lineCount)),
    );
  }

  private aboveLines(spans: Span[], lineCount: number): number[] {
    return spans
      .filter(({ count, start }) => count === 0 && start > 1)
      .map(({ start }) => this.clamp(start - 1, lineCount));
  }

  private belowLines(spans: Span[], lineCount: number): number[] {
    return spans
      .filter(({ count, start }) => count === 0 && start <= lineCount)
      .map(({ start }) => start - 1);
  }

  private clamp(line: number, lineCount: number): number {
    return Math.min(line, lineCount) - 1;
  }
}
