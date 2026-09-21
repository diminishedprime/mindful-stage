import * as vscode from "vscode";
import { injectable } from "tsyringe";
import { type FileBadge, type FileDecorations, NO_BADGE } from "../types";

type Decorated =
  | { kind: "nothing" }
  | { kind: "decoration"; decoration: vscode.FileDecoration };

const NOT_DECORATED: Decorated = { kind: "nothing" };

@injectable()
export class VscodeFileDecorations implements FileDecorations {
  private readonly changed = new vscode.EventEmitter<vscode.Uri[]>();
  private badges = new Map<string, FileBadge>();
  private readonly registration: vscode.Disposable;

  constructor() {
    this.registration = vscode.window.registerFileDecorationProvider({
      onDidChangeFileDecorations: this.changed.event,
      provideFileDecoration: (uri) => {
        const decorated = this.decorationFor(uri.fsPath);
        switch (decorated.kind) {
          case "nothing":
            return undefined;
          case "decoration":
            return decorated.decoration;
        }
      },
    });
  }

  private decorationFor(file: string): Decorated {
    const badge = this.badgeFor(file);
    switch (badge.kind) {
      case "nothing":
        return NOT_DECORATED;
      case "badge":
        return {
          kind: "decoration",
          decoration: {
            badge: badge.badge,
            color: new vscode.ThemeColor(badge.color),
            propagate: true,
          },
        };
    }
  }

  decorate(badges: Map<string, FileBadge>): void {
    const touched = this.differing(badges);
    this.badges = badges;
    if (touched.length === 0) {
      return;
    }
    this.changed.fire(touched.map((file) => vscode.Uri.file(file)));
  }

  async dispose(): Promise<void> {
    this.registration.dispose();
    this.changed.dispose();
  }

  private differing(after: Map<string, FileBadge>): string[] {
    const touched: string[] = [];
    for (const file of this.badges.keys()) {
      if (!after.has(file)) {
        touched.push(file);
      }
    }
    for (const [file, badge] of after) {
      if (!this.same(this.badgeFor(file), badge)) {
        touched.push(file);
      }
    }
    return touched;
  }

  private badgeFor(file: string): FileBadge {
    return this.badges.get(file) ?? NO_BADGE;
  }

  private same(before: FileBadge, after: FileBadge): boolean {
    if (before.kind === "nothing" || after.kind === "nothing") {
      return before.kind === after.kind;
    }
    return before.badge === after.badge && before.color === after.color;
  }
}
