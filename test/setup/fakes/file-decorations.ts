import type { FileBadge, FileDecorations } from "../../../src/types";

export class FakeFileDecorations implements FileDecorations {
  private badges = new Map<string, FileBadge>();

  decorate(badges: Map<string, FileBadge>): void {
    this.badges = badges;
  }

  badgeOn(file: string): string {
    const badge = this.badges.get(file);
    if (badge === undefined) {
      return "";
    }
    return badge.badge;
  }

  colourOn(file: string): string {
    return this.badges.get(file)?.color ?? "";
  }

  get badged(): string[] {
    return [...this.badges.keys()].sort();
  }

  async dispose(): Promise<void> {}
}
