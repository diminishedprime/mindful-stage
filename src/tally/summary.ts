import { Icon } from "../icons";
import {
  type Changes,
  Counted,
  Labelled,
  GitTrackedMode,
  StatusCode,
  type Style,
} from "../types";

export class Summary {
  private static readonly CODE_ORDER = [
    StatusCode.Added,
    StatusCode.Copied,
    StatusCode.Deleted,
    StatusCode.Modified,
    StatusCode.Renamed,
    StatusCode.TypeChanged,
    StatusCode.Unmerged,
    StatusCode.Untracked,
  ];

  private static readonly TERSE: Style = {
    counted: {
      [Counted.UnpushedCommits]: (count) => `$(${Icon.Unpushed})${count}`,
      [Counted.MissingUpstream]: (count) =>
        `$(${Icon.MissingUpstream})${count}`,
    },
    labelled: {
      [Labelled.ReadyToCommit]: `$(${Icon.Ready}) ready to commit`,
      [Labelled.NoLocalChanges]: `$(${Icon.Clean}) No changes`,
    },
  };

  private static readonly PLAIN: Style = {
    counted: {
      [Counted.UnpushedCommits]: (count) => `${count} unpushed commits`,
      [Counted.MissingUpstream]: () => "no upstream",
    },
    labelled: {
      [Labelled.ReadyToCommit]: "ready to commit",
      [Labelled.NoLocalChanges]: "",
    },
  };

  private constructor(
    private readonly countsByCode: Map<StatusCode, number>,
    private readonly staged: number,
    private readonly unpushed: number,
    private readonly missingUpstream: number,
  ) {}

  static none(): Summary {
    return new Summary(new Map(), 0, 0, 0);
  }

  static of(changes: Changes): Summary {
    return new Summary(
      new Map(Object.entries(changes.remaining) as [StatusCode, number][]),
      changes[GitTrackedMode.Staged].isEmpty ? 0 : 1,
      changes.ahead,
      changes.upstream ? 0 : 1,
    );
  }

  static sum(summaries: Iterable<Summary>): Summary {
    let total = Summary.none();
    for (const summary of summaries) {
      total = total.plus(summary);
    }
    return total;
  }

  get anyStaged(): boolean {
    return this.staged > 0;
  }

  plus(other: Summary): Summary {
    const countsByCode = new Map(this.countsByCode);
    for (const [code, count] of other.countsByCode) {
      const total = (countsByCode.get(code) ?? 0) + count;
      if (total === 0) {
        countsByCode.delete(code);
      } else {
        countsByCode.set(code, total);
      }
    }
    return new Summary(
      countsByCode,
      this.staged + other.staged,
      this.unpushed + other.unpushed,
      this.missingUpstream + other.missingUpstream,
    );
  }

  minus(other: Summary): Summary {
    return this.plus(other.negated());
  }

  asOneRepo(): Summary {
    return new Summary(
      this.countsByCode,
      this.staged,
      Math.min(this.unpushed, 1),
      this.missingUpstream,
    );
  }

  terse(): string {
    return this.render(Summary.TERSE);
  }

  plain(): string {
    return this.render(Summary.PLAIN);
  }

  private render(style: Style): string {
    const parts: string[] = [];
    const statusCodes = this.statusCodes();
    if (statusCodes !== "") {
      parts.push(statusCodes);
    } else if (this.staged > 0) {
      parts.push(style.labelled[Labelled.ReadyToCommit]);
    }
    if (this.unpushed > 0) {
      parts.push(style.counted[Counted.UnpushedCommits](this.unpushed));
    }
    if (this.missingUpstream > 0) {
      parts.push(style.counted[Counted.MissingUpstream](this.missingUpstream));
    }
    if (parts.length === 0) {
      return style.labelled[Labelled.NoLocalChanges];
    }
    return parts.join(" ");
  }

  private statusCodes(): string {
    const parts: string[] = [];
    for (const code of Summary.CODE_ORDER) {
      const count = this.countsByCode.get(code);
      if (count !== undefined) {
        parts.push(`${count}${code}`);
      }
    }
    return parts.join(" ");
  }

  private negated(): Summary {
    const countsByCode = new Map<StatusCode, number>();
    for (const [code, count] of this.countsByCode) {
      countsByCode.set(code, -count);
    }
    return new Summary(
      countsByCode,
      -this.staged,
      -this.unpushed,
      -this.missingUpstream,
    );
  }
}
