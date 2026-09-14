import * as fs from "fs/promises";
import * as path from "path";
import { inject, injectable } from "tsyringe";
import { LookupByPath } from "@rushstack/lookup-by-path";
import {
  GIT,
  GIT_REFRESHER,
  REPO_FINDER,
  REPO_LISTENER,
  WORKSPACE_FILE_WATCHER,
  WORKSPACE_FOLDERS,
} from "../di-tokens";
import { Ring } from "../ring";
import {
  type Changes,
  type Disposable,
  type Git,
  type GitRefresher,
  type RepoFinder,
  type RepoListener,
} from "../types";
import { WorkspaceFileWatcher } from "../workspace-file-watcher";
import { Repo } from "./repo";

@injectable()
export class Repos {
  private readonly repoByPath = new LookupByPath<Repo>(undefined, path.sep);
  private ordered: Ring<string> | undefined;
  private readonly fileChangeSubscriptions: Promise<Disposable[]>;
  private readonly initialScan: Promise<unknown>;
  private readonly warm: Promise<unknown>;

  constructor(
    @inject(GIT) private readonly git: Git,
    @inject(GIT_REFRESHER) private readonly gitRefresher: GitRefresher,
    @inject(REPO_FINDER) private readonly repoFinder: RepoFinder,
    @inject(REPO_LISTENER) private readonly listener: RepoListener,
    @inject(WORKSPACE_FOLDERS) workspaceFolders: string[],
    @inject(WORKSPACE_FILE_WATCHER) watcher: WorkspaceFileWatcher,
  ) {
    this.fileChangeSubscriptions = watcher.watch({
      gitDirectoryChanged: (gitDir) => this.repoAppearedOrVanished(gitDir),
      gitInternalsChanged: (file) => this.gitInternalsTouched(file),
      workingTreeChanged: (file) => this.workingTreeTouched(file),
    });
    this.initialScan = Promise.all(
      workspaceFolders.map(async (workspaceFolder) => {
        for (const repo of await repoFinder.findReposUnderWorkspace(
          workspaceFolder,
        )) {
          this.add(repo);
        }
      }),
    );
    this.warm = this.discovered().then(() =>
      Promise.allSettled(
        Array.from(this.all(), (repo) => {
          repo.status.ensureStarted();
          return repo.status.inFlight;
        }),
      ),
    );
  }

  async discovered(): Promise<void> {
    await this.fileChangeSubscriptions;
    await this.initialScan;
  }

  async ready(): Promise<void> {
    await this.warm;
  }

  async primed(): Promise<void> {
    await this.discovered();
    for (const repo of this.all()) {
      repo.status.ensureStarted();
    }
  }

  ring(): Ring<string> {
    this.ordered ??= Ring.of(
      Array.from(this.all(), (repo) => repo.path).sort(),
    );
    return this.ordered;
  }

  byPath(repo: string): Repo {
    return this.repoByPath.get(repo)!;
  }

  repoContaining(file: string): Repo {
    const repo = this.findRepoContaining(file);
    if (repo === undefined) {
      throw new Error(`${file} is not inside any known repo`);
    }
    return repo;
  }

  findRepoContaining(file: string): Repo | undefined {
    return this.repoByPath.findChildPath(file);
  }

  async dispose(): Promise<void> {
    await this.git.dispose();
    await Promise.all([
      this.repoFinder.dispose(),
      this.fileChangeSubscriptions.then((subscriptions) =>
        Promise.all(
          subscriptions.map((subscription) => subscription.dispose()),
        ),
      ),
      Promise.allSettled([
        this.initialScan,
        ...Array.from(this.all(), (repo) => repo.status.inFlight),
      ]),
    ]);
  }

  private *all(): Iterable<Repo> {
    for (const [, repo] of this.repoByPath) {
      yield repo;
    }
  }

  private add(repoPath: string): void {
    if (this.repoByPath.has(repoPath)) {
      return;
    }
    this.repoByPath.setItem(
      repoPath,
      new Repo(repoPath, this.git, this.gitRefresher, (changes) =>
        this.listener.refreshed(repoPath, changes),
      ),
    );
    this.ordered = undefined;
  }

  private remove(repoPath: string): void {
    if (!this.repoByPath.deleteItem(repoPath)) {
      return;
    }
    this.ordered = undefined;
    this.listener.removed(repoPath);
  }

  private async repoAppearedOrVanished(gitDir: string): Promise<void> {
    const repoPath = path.dirname(gitDir);
    if (await Repos.vanished(gitDir)) {
      this.remove(repoPath);
    } else {
      this.add(repoPath);
    }
  }

  private async gitInternalsTouched(file: string): Promise<void> {
    await this.findRepoContaining(file)?.gitDirTouched();
  }

  private async workingTreeTouched(file: string): Promise<void> {
    await this.findRepoContaining(file)?.fileTouched(file);
  }

  private static async vanished(gitDir: string): Promise<boolean> {
    try {
      await fs.access(gitDir);
      return false;
    } catch {
      return true;
    }
  }
}
