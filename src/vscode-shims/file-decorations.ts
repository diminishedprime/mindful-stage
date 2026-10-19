import {
  type Disposable,
  EventEmitter,
  type FileDecoration,
  ThemeColor,
  Uri,
  window,
} from "vscode";
import { injectable } from "tsyringe";
import type { FileBadge, FileDecorations } from "../types";

@injectable()
export class VscodeFileDecorations implements FileDecorations {
  private readonly changed = new EventEmitter<Uri[]>();
  private badges = new Map<string, FileBadge>();
  private readonly registration: Disposable;

  constructor() {
    this.registration = window.registerFileDecorationProvider({
      onDidChangeFileDecorations: this.changed.event,
      provideFileDecoration: (uri) => this.decorationFor(uri.fsPath),
    });
  }

  private decorationFor(file: string): FileDecoration | undefined {
    const badge = this.badges.get(file);
    if (badge === undefined) {
      return undefined;
    }
    return {
      badge: badge.badge,
      color: new ThemeColor(badge.color),
      propagate: true,
    };
  }

  decorate(badges: Map<string, FileBadge>): void {
    const touched = this.differing(badges);
    this.badges = badges;
    if (touched.length === 0) {
      return;
    }
    this.changed.fire(touched.map((file) => Uri.file(file)));
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
      if (!this.same(this.badges.get(file), badge)) {
        touched.push(file);
      }
    }
    return touched;
  }

  private same(before: FileBadge | undefined, after: FileBadge): boolean {
    return before?.badge === after.badge && before.color === after.color;
  }
}
