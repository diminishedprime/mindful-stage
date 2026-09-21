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
import { MarkedLines } from "./marked-lines";

@injectable()
export class Compositor {
  compose(marks: Marks, lineCount: number): Composition[] {
    const staged = marks[GitTrackedMode.Staged];
    const unstaged = marks[GitTrackedMode.Unstaged];
    const marked = new MarkedLines();

    marked.changed(this.changedLines(staged, lineCount), Change.Staged);
    marked.changed(this.changedLines(unstaged, lineCount), Change.Unstaged);
    marked.changed(
      this.changedLines(marks[UNTRACKED], lineCount),
      Change.Untracked,
    );
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
    const at: number[] = [];
    for (const { start, count } of spans) {
      for (let line = start; line < start + count; line += 1) {
        at.push(this.clamp(line, lineCount));
      }
    }
    return at;
  }

  private aboveLines(spans: Span[], lineCount: number): number[] {
    return spans
      .filter(({ count, start }) => count === 0 && start > 1)
      .map(({ start }) =>
        this.clamp(Math.min(start, lineCount + 1) - 1, lineCount),
      );
  }

  private belowLines(spans: Span[], lineCount: number): number[] {
    return spans
      .filter(({ count, start }) => count === 0 && start <= lineCount)
      .map(({ start }) => this.clamp(start, lineCount));
  }

  private clamp(line: number, lineCount: number): number {
    return Math.min(line, lineCount) - 1;
  }
}
