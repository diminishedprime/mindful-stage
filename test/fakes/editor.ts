import type { Editor, Position } from "../../src/types";

export class FakeEditor implements Editor {
  opened: Position[] = [];

  active(): Position | undefined {
    return this.opened.at(-1);
  }

  async open(path: string, line = 1): Promise<void> {
    this.opened.push({ path, line });
  }
}
