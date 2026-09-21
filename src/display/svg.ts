export type Area = { x: number; y: number; width: number; height: number };

export type Stroke = { color: string; width: number; clip: string };

export type Step =
  | { kind: "moveTo"; x: number; y: number }
  | { kind: "lineTo"; x: number; y: number }
  | { kind: "close" };

export type Node =
  | { kind: "nothing" }
  | { kind: "fragment"; children: Node[] }
  | { kind: "svg"; size: number; children: Node[] }
  | { kind: "mask"; id: string; children: Node[] }
  | { kind: "masked"; id: string; children: Node[] }
  | { kind: "clip"; id: string; children: Node[] }
  | { kind: "rect"; area: Area }
  | { kind: "filledRect"; area: Area; color: string }
  | { kind: "filledPath"; steps: Step[]; color: string }
  | { kind: "strokedPath"; steps: Step[]; stroke: Stroke };

export const NOTHING: Node = { kind: "nothing" };

export const CLOSE: Step = { kind: "close" };

export function moveTo(x: number, y: number): Step {
  return { kind: "moveTo", x, y };
}

export function lineTo(x: number, y: number): Step {
  return { kind: "lineTo", x, y };
}

export function fragment(...children: Node[]): Node {
  return { kind: "fragment", children };
}

export function svg(size: number, ...children: Node[]): Node {
  return { kind: "svg", size, children };
}

export function mask(id: string, ...children: Node[]): Node {
  return { kind: "mask", id, children };
}

export function masked(id: string, ...children: Node[]): Node {
  return { kind: "masked", id, children };
}

export function clip(id: string, ...children: Node[]): Node {
  return { kind: "clip", id, children };
}

export function rect(area: Area): Node {
  return { kind: "rect", area };
}

export function filledRect(area: Area, color: string): Node {
  return { kind: "filledRect", area, color };
}

export function filledPath(steps: Step[], color: string): Node {
  return { kind: "filledPath", steps, color };
}

export function strokedPath(steps: Step[], stroke: Stroke): Node {
  return { kind: "strokedPath", steps, stroke };
}

export function render(node: Node): string {
  switch (node.kind) {
    case "nothing":
      return "";
    case "fragment":
      return renderAll(node.children);
    case "svg":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${node.size} ${node.size}">${renderAll(node.children)}</svg>`;
    case "mask":
      return `<mask id="${node.id}">${renderAll(node.children)}</mask>`;
    case "masked":
      return `<g mask="url(#${node.id})">${renderAll(node.children)}</g>`;
    case "clip":
      return `<clipPath id="${node.id}">${renderAll(node.children)}</clipPath>`;
    case "rect":
      return `<rect ${renderArea(node.area)}/>`;
    case "filledRect":
      return `<rect ${renderArea(node.area)} fill="${node.color}"/>`;
    case "filledPath":
      return `<path d="${renderSteps(node.steps)}" fill="${node.color}"/>`;
    case "strokedPath":
      return `<path d="${renderSteps(node.steps)}" clip-path="url(#${node.stroke.clip})" stroke="${node.stroke.color}" stroke-width="${node.stroke.width}" fill="none"/>`;
  }
}

function renderAll(children: Node[]): string {
  let markup = "";
  for (const child of children) {
    markup += render(child);
  }
  return markup;
}

function renderArea({ x, y, width, height }: Area): string {
  return `x="${x}" y="${y}" width="${width}" height="${height}"`;
}

function renderSteps(steps: Step[]): string {
  let drawn = "";
  for (const step of steps) {
    if (drawn !== "") {
      drawn += " ";
    }
    drawn += renderStep(step);
  }
  return drawn;
}

function renderStep(step: Step): string {
  switch (step.kind) {
    case "moveTo":
      return `M${step.x},${step.y}`;
    case "lineTo":
      return `L${step.x},${step.y}`;
    case "close":
      return "Z";
  }
}
