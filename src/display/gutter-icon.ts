import { injectable } from "tsyringe";
import {
  type Area,
  CLOSE,
  clip,
  filledPath,
  filledRect,
  fragment,
  lineTo,
  mask,
  masked,
  moveTo,
  NOTHING,
  type Node,
  rect,
  type Step,
  strokedPath,
  svg,
} from "./svg";

const BOX = 18;
const LEFT = 5.5;
const WIDTH = 7;
const SPACING = 3;
const STROKE = 1.5;
const HALF_WEDGE = 4;
const OVERHANG_LEFT = 2;
const OVERHANG_RIGHT = 5;
const PAD = 3;

const CUT = "cut";
const HATCH = "hatch";

const CELL: Area = { x: 0, y: 0, width: BOX, height: BOX };
const COLUMN: Area = { x: LEFT, y: 0, width: WIDTH, height: BOX };

export type Band =
  | { kind: "nothing" }
  | { kind: "solid"; color: string }
  | { kind: "hatched"; color: string };

export type Edge = { kind: "nothing" } | { kind: "wedge"; color: string };

export type Icon = { band: Band; above: Edge; below: Edge };

export const NO_BAND: Band = { kind: "nothing" };
export const NO_EDGE: Edge = { kind: "nothing" };

@injectable()
export class GutterIcon {
  draw({ band, above, below }: Icon): Node {
    return svg(
      BOX,
      this.cleared(this.band(band), above, below),
      this.wedge(above, true, 0),
      this.wedge(below, false, 0),
    );
  }

  private cleared(band: Node, above: Edge, below: Edge): Node {
    if (above.kind === "nothing" && below.kind === "nothing") {
      return band;
    }
    return fragment(
      mask(
        CUT,
        filledRect(CELL, "white"),
        this.clearance(above, true),
        this.clearance(below, false),
      ),
      masked(CUT, band),
    );
  }

  private band(band: Band): Node {
    switch (band.kind) {
      case "nothing":
        return NOTHING;
      case "solid":
        return filledRect(COLUMN, band.color);
      case "hatched":
        return this.hatched(band.color);
    }
  }

  private wedge(edge: Edge, above: boolean, grow: number): Node {
    return edge.kind === "nothing"
      ? NOTHING
      : filledPath(this.triangle(above, grow), edge.color);
  }

  private clearance(edge: Edge, above: boolean): Node {
    return edge.kind === "nothing"
      ? NOTHING
      : filledPath(this.triangle(above, PAD), "black");
  }

  private triangle(above: boolean, grow: number): Step[] {
    const left = LEFT - OVERHANG_LEFT - grow;
    const apex = LEFT + WIDTH + OVERHANG_RIGHT + grow;
    return above
      ? [
          moveTo(left, BOX - HALF_WEDGE - grow),
          lineTo(left, BOX),
          lineTo(apex, BOX),
          CLOSE,
        ]
      : [
          moveTo(left, 0),
          lineTo(left, HALF_WEDGE + grow),
          lineTo(apex, 0),
          CLOSE,
        ];
  }

  private hatched(color: string): Node {
    const steps: Step[] = [];
    for (
      let offset = -SPACING * 2;
      offset <= BOX + SPACING;
      offset += SPACING
    ) {
      steps.push(moveTo(LEFT, offset), lineTo(LEFT + WIDTH, offset + WIDTH));
    }
    return fragment(
      clip(HATCH, rect(COLUMN)),
      strokedPath(steps, { color, width: STROKE, clip: HATCH }),
    );
  }
}
