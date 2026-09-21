import type { FileBadge, FileDecorations } from "../../src/types";

export class FakeFileDecorations implements FileDecorations {
  private badges = new Map<string, FileBadge>();

  decorate(badges: Map<string, FileBadge>): void {
    this.badges = badges;
  }

  badgeOn(file: string): string {
    const badge = this.badges.get(file);
    if (badge === undefined || badge.kind === "nothing") {
      return "";
    }
    return badge.badge;
  }

  get badged(): string[] {
    return [...this.badges.keys()].sort();
  }

  async dispose(): Promise<void> {}
}
