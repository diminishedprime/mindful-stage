import * as fs from "fs/promises";
import * as path from "path";
import { inject, injectable } from "tsyringe";
import Gitignore from "gitignore-fs";
import {
  type Changes,
  Direction,
  type Disposable,
  type Editor,
  type Git,
  type GitRefresher,
  type Hunk,
  Mode,
  type Notifier,
  type RepoFinder,
  type StatusBar,
  type Tracked,
  type Watcher,
} from "./types";

export const EDITOR = Symbol("Editor");
export const NOTIFIER = Symbol("Notifier");
export const GIT = Symbol("Git");
export const GIT_REFRESHER = Symbol("GitRefresher");
export const REPO_FINDER = Symbol("RepoFinder");
export const ROOTS = Symbol("Roots");
export const STATUS_BAR = Symbol("StatusBar");
export const WATCHER = Symbol("Watcher");

export const READMES = [
  "readme.md",
  "readme.markdown",
  "readme.rst",
  "readme.org",
  "readme.txt",
  "readme",
] as const;

@injectable()
export class Commands {
  private readonly tracked = new Map<string, Tracked>();
  private readonly totals = new Map<string, number>();
  private readonly gitignore = new Gitignore();
  private readonly watching: Promise<Disposable[]>;
  private repos: Promise<string[]>;
  private readonly warm: Promise<void>;
  private lastNavigation: (() => Promise<void>) | undefined;

  constructor(
    @inject(EDITOR) private readonly editor: Editor,
    @inject(GIT) private readonly git: Git,
    @inject(GIT_REFRESHER) private readonly gitRefresher: GitRefresher,
    @inject(NOTIFIER) private readonly notifier: Notifier,
    @inject(REPO_FINDER) private readonly finder: RepoFinder,
    @inject(STATUS_BAR) private readonly statusBar: StatusBar,
    @inject(ROOTS) roots: string[],
    @inject(WATCHER) watcher: Watcher,
  ) {
    this.watching = Promise.all(
      roots.map((root) =>
        watcher.watch(root, (changed) => this.onChange(changed)),
      ),
    );
    this.repos = Promise.all(roots.map((root) => finder.find(root))).then(
      (found) => found.flat().sort(),
    );
    this.warm = this.repos.then(async (repos) => {
      await Promise.allSettled(repos.map((repo) => this.track(repo).pending));
    });
  }

  async nextUnstaged(): Promise<void> {
    await this.jump(Direction.Next, Mode.Unstaged);
  }

  async prevUnstaged(): Promise<void> {
    await this.jump(Direction.Previous, Mode.Unstaged);
  }

  async nextStaged(): Promise<void> {
    await this.jump(Direction.Next, Mode.Staged);
  }

  async prevStaged(): Promise<void> {
    await this.jump(Direction.Previous, Mode.Staged);
  }

  async nextUnstagedHunk(): Promise<void> {
    await this.jumpHunk(Direction.Next, Mode.Unstaged);
  }

  async prevUnstagedHunk(): Promise<void> {
    await this.jumpHunk(Direction.Previous, Mode.Unstaged);
  }

  async nextStagedHunk(): Promise<void> {
    await this.jumpHunk(Direction.Next, Mode.Staged);
  }

  async prevStagedHunk(): Promise<void> {
    await this.jumpHunk(Direction.Previous, Mode.Staged);
  }

  async nextStagedRepo(): Promise<void> {
    await this.jumpRepo(Direction.Next);
  }

  async prevStagedRepo(): Promise<void> {
    await this.jumpRepo(Direction.Previous);
  }

  private async jumpRepo(direction: Direction): Promise<void> {
    this.lastNavigation = () => this.jumpRepo(direction);
    await this.watching;
    const repos = Commands.ringOrder(direction, await this.repos);
    repos.forEach((repo) => this.track(repo));
    const from = this.editor.active()?.path;
    const home = from === undefined ? undefined : await this.repoOf(from);
    const ring =
      home === undefined ? repos : Commands.ringFrom(repos, home).slice(1);
    for (const repo of ring) {
      const staged = (await this.changesOf(repo))[Mode.Staged];
      const target = Commands.pickFile(direction, staged);
      if (target !== undefined) {
        await this.land(target);
        await this.announceCrossing(from, target);
        return;
      }
    }
    this.notifier.notify("no staged files");
  }

  async ready(): Promise<void> {
    await this.watching;
    await this.warm;
  }

  reconcile(): void {
    this.totals.clear();
    for (const { known } of this.tracked.values()) {
      for (const [code, count] of Object.entries(known?.remaining ?? {})) {
        this.bump(code, count);
      }
    }
    this.statusBar.show(Commands.summarize(this.totals));
  }

  async repeatLast(): Promise<void> {
    await this.lastNavigation?.();
  }

  async startTracking(): Promise<void> {
    const active = this.editor.active()!;
    const repo = await this.repoOf(active.path);
    const file = path.relative(repo, active.path);
    if (!(await this.freshChangesOf(repo)).untracked.includes(active.path)) {
      this.notifier.error(`'${path.basename(file)}' is already tracked`);
      return;
    }
    const content = await fs.readFile(active.path, "utf8");
    const newline = content.indexOf("\n");
    const firstLine = newline === -1 ? content : content.slice(0, newline + 1);
    const hash = await this.git.hashObject(repo, firstLine);
    await this.git.addToIndex(repo, file, hash);
    this.gitRefresher.refresh(repo);
  }

  async stageHunkAtCursor(): Promise<void> {
    const active = this.editor.active()!;
    const hunk = (await this.hunksOf(active.path, Mode.Unstaged)).find(
      (h) =>
        h.start <= active.line && active.line < h.start + Math.max(h.count, 1),
    );
    if (hunk === undefined) {
      this.notifier.notify("no unstaged hunk at cursor");
      return;
    }
    const repo = await this.repoOf(active.path);
    await this.git.stage(repo, hunk);
    this.gitRefresher.refresh(repo);
  }

  private async jumpHunk(direction: Direction, mode: Mode): Promise<void> {
    this.lastNavigation = () => this.jumpHunk(direction, mode);
    const active = this.editor.active()!;
    const starts = (await this.hunksOf(active.path, mode)).map((h) => h.start);
    const next = Commands.pickHunk(direction, starts, active.line);
    if (next !== undefined) {
      await this.editor.open(active.path, next);
      return;
    }
    const file = await this.nextFile(direction, mode);
    if (file === undefined) {
      await this.reportNothingLeft(mode);
      return;
    }
    const targets = (await this.hunksOf(file, mode)).map((h) => h.start);
    await this.land(file, Commands.pickHunk(direction, targets));
    await this.announceCrossing(active.path, file);
  }

  private static pickHunk(
    direction: Direction,
    starts: number[],
    after?: number,
  ): number | undefined {
    switch (direction) {
      case Direction.Next:
        return after === undefined ? starts[0] : starts.find((s) => s > after);
      case Direction.Previous:
        return after === undefined
          ? starts.at(-1)
          : starts.findLast((s) => s < after);
    }
  }

  private async hunksOf(file: string, mode: Mode): Promise<Hunk[]> {
    const repo = await this.repoOf(file);
    return this.git.hunks(repo, path.relative(repo, file), mode);
  }

  private async repoOf(file: string): Promise<string> {
    return (await this.repos).findLast((r) => file.startsWith(r + path.sep))!;
  }

  async dispose(): Promise<void> {
    const inFlight = Promise.allSettled([
      this.repos,
      ...[...this.tracked.values()].map((t) => t.pending),
    ]);
    await this.git.dispose();
    await this.finder.dispose();
    await this.statusBar.dispose();
    await Promise.all((await this.watching).map((w) => w.dispose()));
    await inFlight;
  }

  private async jump(direction: Direction, mode: Mode): Promise<void> {
    this.lastNavigation = () => this.jump(direction, mode);
    const from = this.editor.active()?.path;
    const target = await this.nextFile(direction, mode);
    if (target === undefined) {
      await this.reportNothingLeft(mode);
      return;
    }
    await this.land(target);
    await this.announceCrossing(from, target);
    await this.hintIfUntracked(target);
  }

  private async reportNothingLeft(mode: Mode): Promise<void> {
    if (mode === Mode.Unstaged && (await this.anythingStaged())) {
      this.notifier.notify(
        "no remaining unstaged files, use `mindfulStage.nextStagedRepo` to navigate through repos ready to be committed.",
      );
      return;
    }
    this.notifier.notify(`no ${mode} files`);
  }

  private async anythingStaged(): Promise<boolean> {
    for (const repo of await this.repos) {
      if ((await this.changesOf(repo))[Mode.Staged].length > 0) {
        return true;
      }
    }
    return false;
  }

  private async land(target: string, line?: number): Promise<void> {
    const name = path.basename(target);
    if (await this.isDeleted(target)) {
      await this.standIn(target, `${name} was deleted`, "stage the deletion");
    } else if (await Commands.isBinary(target)) {
      await this.standIn(target, `can't open ${name}`, `handle ${name}`);
    } else {
      await this.editor.open(target, line);
    }
  }

  private async isDeleted(file: string): Promise<boolean> {
    const changes = await this.changesOf(await this.repoOf(file));
    return changes.deleted.includes(file);
  }

  private async standIn(
    target: string,
    problem: string,
    advice: string,
  ): Promise<void> {
    const repo = await this.repoOf(target);
    const fallback = await this.firstOpenable(repo);
    if (fallback === undefined) {
      this.notifier.error(
        `${problem}, and nothing in ${path.basename(repo)} can be opened instead, so ${advice} manually.`,
      );
      return;
    }
    this.notifier.error(
      `${problem}, opening first tracked file so you can ${advice} manually.`,
    );
    await this.editor.open(fallback);
  }

  private async firstOpenable(repo: string): Promise<string | undefined> {
    const tracked = await this.git.trackedFiles(repo);
    const readme = Commands.readmeIn(tracked);
    for (const file of readme === undefined ? tracked : [readme, ...tracked]) {
      const candidate = path.join(repo, file);
      if (await Commands.isOpenable(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private static readmeIn(tracked: string[]): string | undefined {
    for (const name of READMES) {
      const match = tracked.find((file) => file.toLowerCase() === name);
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  private static async isOpenable(file: string): Promise<boolean> {
    try {
      return !(await Commands.isBinary(file));
    } catch {
      return false;
    }
  }

  private async hintIfUntracked(file: string): Promise<void> {
    const changes = await this.changesOf(await this.repoOf(file));
    if (changes.untracked.includes(file)) {
      this.notifier.notify("untracked file, use start tracking to stage it");
    }
  }

  private async announceCrossing(from: string | undefined, to: string) {
    if (from === undefined) {
      return;
    }
    const repo = await this.repoOf(to);
    if ((await this.repoOf(from)) !== repo) {
      this.notifier.notify(`now in ${path.basename(repo)}`);
    }
  }

  private async nextFile(
    direction: Direction,
    mode: Mode,
  ): Promise<string | undefined> {
    await this.watching;
    const repos = Commands.ringOrder(direction, await this.repos);
    repos.forEach((repo) => this.track(repo));
    const active = this.editor.active()?.path;
    const home = active === undefined ? undefined : await this.repoOf(active);
    const ring = home === undefined ? repos : Commands.ringFrom(repos, home);
    for (const [visit, repo] of ring.entries()) {
      const files = (await this.changesOf(repo))[mode];
      const after = visit === 0 && repo === home ? active : undefined;
      const target = Commands.pickFile(direction, files, after);
      if (target !== undefined) {
        return target;
      }
    }
    return undefined;
  }

  private static ringOrder(direction: Direction, repos: string[]): string[] {
    switch (direction) {
      case Direction.Next:
        return repos;
      case Direction.Previous:
        return repos.toReversed();
    }
  }

  private static pickFile(
    direction: Direction,
    files: string[],
    after?: string,
  ): string | undefined {
    switch (direction) {
      case Direction.Next:
        return after === undefined ? files[0] : files.find((f) => f > after);
      case Direction.Previous:
        return after === undefined
          ? files.at(-1)
          : files.findLast((f) => f < after);
    }
  }

  private static ringFrom(repos: string[], home: string): string[] {
    const at = repos.indexOf(home);
    return [...repos.slice(at), ...repos.slice(0, at), home];
  }

  private async changesOf(repo: string): Promise<Changes> {
    const tracked = this.track(repo);
    return tracked.known ?? (await tracked.pending!);
  }

  private async freshChangesOf(repo: string): Promise<Changes> {
    const tracked = this.track(repo);
    return (await tracked.pending) ?? tracked.known!;
  }

  private track(repo: string): Tracked {
    let tracked = this.tracked.get(repo);
    if (!tracked) {
      tracked = {};
      this.tracked.set(repo, tracked);
    }
    if (tracked.known === undefined && tracked.pending === undefined) {
      this.refresh(repo, tracked);
    }
    return tracked;
  }

  private refresh(repo: string, tracked: Tracked): Promise<Changes> {
    tracked.pending ??= this.changes(repo).then(
      (changes) => {
        this.retotal(tracked.known, changes);
        tracked.known = changes;
        tracked.pending = undefined;
        return changes;
      },
      (error) => {
        tracked.pending = undefined;
        throw error;
      },
    );
    return tracked.pending;
  }

  private async onChange(changed: string): Promise<void> {
    if (path.basename(changed) === ".git") {
      const found = path.dirname(changed);
      this.repos = this.repos.then((repos) =>
        repos.includes(found) ? repos : [...repos, found].sort(),
      );
      return;
    }
    const repo = [...this.tracked.keys()]
      .filter((candidate) => changed.startsWith(candidate + path.sep))
      .sort()
      .at(-1);
    if (repo === undefined) {
      return;
    }
    if (Commands.isIgnoreRuleFile(changed)) {
      this.gitignore.clearCache();
    } else if (
      !Commands.insideGitDir(changed) &&
      (await this.gitignore.ignores(changed))
    ) {
      return;
    }
    const tracked = this.tracked.get(repo)!;
    await Promise.allSettled([tracked.pending]);
    await Promise.allSettled([this.refresh(repo, tracked)]);
  }

  private retotal(before: Changes | undefined, after: Changes): void {
    for (const [code, count] of Object.entries(before?.remaining ?? {})) {
      this.bump(code, -count);
    }
    for (const [code, count] of Object.entries(after.remaining)) {
      this.bump(code, count);
    }
    this.statusBar.show(Commands.summarize(this.totals));
  }

  private bump(code: string, by: number): void {
    const total = (this.totals.get(code) ?? 0) + by;
    if (total === 0) {
      this.totals.delete(code);
    } else {
      this.totals.set(code, total);
    }
  }

  private static summarize(totals: Map<string, number>): string {
    if (totals.size === 0) {
      return "ready to commit";
    }
    return [...totals]
      .sort(([a], [b]) => (Commands.rank(a) < Commands.rank(b) ? -1 : 1))
      .map(([code, count]) => `${count}${code}`)
      .join(" ");
  }

  private static rank(code: string): string {
    return code === "?" ? "~" : code;
  }

  private static insideGitDir(file: string): boolean {
    return file.includes(`${path.sep}.git${path.sep}`);
  }

  private static isIgnoreRuleFile(file: string): boolean {
    return (
      path.basename(file) === ".gitignore" ||
      file.endsWith(path.join(".git", "info", "exclude"))
    );
  }

  private async changes(repo: string): Promise<Changes> {
    const { files, not_added } = await this.git.status(repo);
    const remaining: Record<string, number> = {};
    for (const file of files) {
      if (file.working_dir !== " ") {
        remaining[file.working_dir] = (remaining[file.working_dir] ?? 0) + 1;
      }
    }
    const unstaged = files
      .filter((f) => f.working_dir !== " ")
      .map((f) => f.path);
    const deleted = files
      .filter((f) => f.working_dir === "D")
      .map((f) => f.path);
    const staged = files
      .filter((f) => f.index !== " " && f.index !== "?" && f.index !== "D")
      .map((f) => f.path);
    const lfs =
      unstaged.length === 0
        ? new Set<string>()
        : await this.git.lfsPaths(repo, unstaged);
    const absolute = (paths: string[]) =>
      paths
        .filter((p) => !lfs.has(p))
        .map((p) => path.join(repo, p))
        .sort();
    return {
      [Mode.Unstaged]: absolute(unstaged),
      [Mode.Staged]: absolute(staged),
      untracked: absolute(not_added),
      deleted: absolute(deleted),
      remaining,
    };
  }

  private static async isBinary(file: string): Promise<boolean> {
    const handle = await fs.open(file);
    try {
      const { bytesRead, buffer } = await handle.read(
        Buffer.alloc(8000),
        0,
        8000,
        0,
      );
      return buffer.subarray(0, bytesRead).includes(0);
    } finally {
      await handle.close();
    }
  }
}
