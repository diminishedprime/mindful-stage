import {
  Change,
  Deletion,
  type Mark,
  type PaletteKey,
  SCOPES,
  type Wedge,
} from "../types";
import {
  type Band,
  type Edge,
  GutterIcon,
  NO_BAND,
  NO_EDGE,
} from "./gutter-icon";
import { render } from "./svg";

type GutterTemplates = Record<Mark, string>;

type Drawn = { mark: Mark; change: Change; above: Deletion; below: Deletion };

const DELETIONS = Object.values(Deletion);

const WEDGES: readonly Wedge[] = [Deletion.Staged, Deletion.Unstaged];

function shownMarks(): Drawn[] {
  const shown: Drawn[] = [
    {
      mark: `${Change.Untracked}/${Deletion.Nothing}/${Deletion.Nothing}`,
      change: Change.Untracked,
      above: Deletion.Nothing,
      below: Deletion.Nothing,
    },
  ];
  for (const change of [Change.Staged, Change.Unstaged] as const) {
    for (const above of DELETIONS) {
      for (const below of DELETIONS) {
        shown.push({
          mark: `${change}/${above}/${below}`,
          change,
          above,
          below,
        });
      }
    }
  }
  for (const above of WEDGES) {
    for (const below of DELETIONS) {
      shown.push({
        mark: `${Change.Nothing}/${above}/${below}`,
        change: Change.Nothing,
        above,
        below,
      });
    }
  }
  for (const below of WEDGES) {
    shown.push({
      mark: `${Change.Nothing}/${Deletion.Nothing}/${below}`,
      change: Change.Nothing,
      above: Deletion.Nothing,
      below,
    });
  }
  return shown;
}

export function colorPlaceholders(): Record<PaletteKey, string> {
  return Object.fromEntries(
    Object.keys(SCOPES).map((key) => [key, `__${key}__`]),
  ) as Record<PaletteKey, string>;
}

export function drawTemplates(): GutterTemplates {
  const placeholders = colorPlaceholders();
  const icons = new GutterIcon();
  const templates = {} as GutterTemplates;
  for (const { mark, change, above, below } of shownMarks()) {
    templates[mark] = encodeURIComponent(
      render(
        icons.draw({
          band: bandFor(change, placeholders),
          above: edgeFor(above, placeholders),
          below: edgeFor(below, placeholders),
        }),
      ),
    );
  }
  return templates;
}

function bandFor(change: Change, colors: Record<PaletteKey, string>): Band {
  switch (change) {
    case Change.Staged:
      return { kind: "solid", color: colors.stagedChange };
    case Change.Unstaged:
      return { kind: "hatched", color: colors.unstagedChange };
    case Change.Untracked:
      return { kind: "hatched", color: colors.untracked };
    default:
      return NO_BAND;
  }
}

function edgeFor(deletion: Deletion, colors: Record<PaletteKey, string>): Edge {
  switch (deletion) {
    case Deletion.Staged:
      return { kind: "wedge", color: colors.stagedDeletion };
    case Deletion.Unstaged:
      return { kind: "wedge", color: colors.unstagedDeletion };
    default:
      return NO_EDGE;
  }
}
