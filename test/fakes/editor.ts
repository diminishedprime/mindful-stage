import * as fs from "fs";
import {
  type Cursor,
  type Editor,
  NOWHERE,
  type Position,
} from "../../src/types";

export class FakeEditor implements Editor {
  opened: Position[] = [];

  active(): Cursor {
    const at = this.opened.at(-1);
    if (at === undefined) {
      return NOWHERE;
    }
    return { kind: "somewhere", at };
  }

  visibleFiles(): string[] {
    const cursor = this.active();
    if (cursor.kind === "nowhere") {
      return [];
    }
    return [cursor.at.path];
  }

  numberOfLines(file: string): number {
    if (!this.visibleFiles().includes(file) || !fs.existsSync(file)) {
      return 0;
    }
    return fs.readFileSync(file, "utf8").split("\n").length;
  }

  async open(path: string, line = 1): Promise<void> {
    this.opened.push({ path, line });
  }
}
