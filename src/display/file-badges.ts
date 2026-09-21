import { inject, injectable } from "tsyringe";
import { FILE_DECORATIONS, PALETTE, REPOS } from "../di-tokens";
import { Palette } from "../palette";
import { Repos } from "../repos";
import {
  type Badged,
  Change,
  type Changes,
  Direction,
  type FileBadge,
  type FileDecorations,
  type PaletteKey,
  GitTrackedMode,
  type RepoListener,
} from "../types";

@injectable()
export class FileBadges implements RepoListener {
  private readonly byRepo = new Map<string, Map<string, FileBadge>>();

  constructor(
    @inject(FILE_DECORATIONS) private readonly decorations: FileDecorations,
    @inject(PALETTE) private readonly palette: Palette,
    @inject(REPOS) repos: Repos,
  ) {
    repos.subscribe(this);
  }

  refreshed(repo: string, changes: Changes): void {
    this.byRepo.set(repo, this.marking(changes));
    this.decorate();
  }

  removed(repo: string): void {
    this.byRepo.delete(repo);
    this.decorate();
  }

  private decorate(): void {
    const badges = new Map<string, FileBadge>();
    for (const repo of this.byRepo.values()) {
      for (const [file, badge] of repo) {
        badges.set(file, badge);
      }
    }
    this.decorations.decorate(badges);
  }

  private marking(changes: Changes): Map<string, FileBadge> {
    const badges = new Map<string, FileBadge>();
    const sources = Object.entries(this.sources(changes)) as [
      Badged,
      Iterable<string>,
    ][];
    for (const [change, files] of sources) {
      const badge = this.badgeFor(change);
      for (const file of files) {
        badges.set(file, badge);
      }
    }
    return badges;
  }

  private sources(changes: Changes): Record<Badged, Iterable<string>> {
    return {
      [Change.Staged]: changes[GitTrackedMode.Staged].all(Direction.Next),
      [Change.Unstaged]: changes[GitTrackedMode.Unstaged].all(Direction.Next),
      [Change.Untracked]: changes.untracked,
    };
  }

  private badgeFor(change: Badged): FileBadge {
    switch (change) {
      case Change.Staged:
        return this.badge("S", "stagedChange");
      case Change.Unstaged:
        return this.badge("M", "unstagedChange");
      case Change.Untracked:
        return this.badge("A", "untracked");
    }
  }

  private badge(badge: string, key: PaletteKey): FileBadge {
    return { kind: "badge", badge, color: this.palette.colorId(key) };
  }
}
