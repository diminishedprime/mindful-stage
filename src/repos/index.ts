import * as path from "path";
import { inject, injectable } from "tsyringe";
import { LookupByPath } from "@rushstack/lookup-by-path";
import {
  FS,
  GIT,
  GITIGNORES,
  LOGGER,
  NOTIFIER,
  REPO_FINDER,
  WORKSPACE_FILE_WATCHER,
  WORKSPACE_FOLDERS,
} from "../di-tokens";
import { Gitignores } from "../gitignores";
import { Logger } from "../logger";
import { Ring } from "../ring";
import {
  type Disposable,
  type Fs,
  type Git,
  type Notifier,
  type RepoFinder,
  type RepoListener,
} from "../types";
import { WorkspaceFileWatcher } from "../workspace-file-watcher";
import { Repo } from "./repo";

@injectable()
export class Repos {
  private readonly repoByPath = new LookupByPath<Repo>(undefined, path.sep);
  private readonly listeners: RepoListener[] = [];
  private ordered: Ring<string> | undefined;
  private readonly subscriptions: Disposable[] = [];

  constructor(
    @inject(FS) private readonly fs: Fs,
    @inject(GIT) private readonly git: Git,
    @inject(NOTIFIER) private readonly notifier: Notifier,
    @inject(LOGGER) private readonly logger: Logger,
    @inject(REPO_FINDER) private readonly repoFinder: RepoFinder,
    @inject(WORKSPACE_FOLDERS) private readonly workspaceFolders: string[],
    @inject(WORKSPACE_FILE_WATCHER)
    private readonly watcher: WorkspaceFileWatcher,
    @inject(GITIGNORES) private readonly gitignores: Gitignores,
  ) {}

  async start(): Promise<void> {
    this.subscriptions.push(
      ...(await this.watcher.watch({
        gitDirectoryAdded: (gitDir) => this.add(path.dirname(gitDir)),
        gitDirectoryDeleted: (gitDir) => this.remove(path.dirname(gitDir)),
        gitInternalsChanged: (file) => this.gitInternalsTouched(file),
        workingTreeChanged: (file) => this.workingTreeTouched(file),
        pathDeleted: (deleted) => this.reposDeletedWith(deleted),
      })),
    );
    await Promise.all(
      this.workspaceFolders.map((folder) =>
        this.repoFinder.findReposUnderWorkspace(folder, (repo) =>
          this.add(repo),
        ),
      ),
    );
  }

  subscribe(listener: RepoListener): void {
    this.listeners.push(listener);
  }

  async ready(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.all(), (repo) => repo.status.inFlight),
    );
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
    // Stryker disable all: only reachable if the repo is removed between
    // reading its status and here which isn't worth simulating in tests.
    if (repo === undefined) {
      throw new Error(`${file} is not inside any known repo`);
    }
    // Stryker restore all
    return repo;
  }

  findRepoContaining(file: string): Repo | undefined {
    return this.repoByPath.findChildPath(file);
  }

  // Stryker disable all: disposal is not observable through the test fakes
  async dispose(): Promise<void> {
    await Promise.all([
      ...this.subscriptions.map((subscription) => subscription.dispose()),
      ...Array.from(this.all(), (repo) => repo.status.inFlight),
    ]);
  }
  // Stryker restore all

  private *all(): Iterable<Repo> {
    for (const [, repo] of this.repoByPath) {
      yield repo;
    }
  }

  private async add(repoPath: string): Promise<void> {
    const ignoring = this.gitignores.ignoresDirectory(repoPath);
    const admitted = Promise.withResolvers<boolean>();
    const repo: Repo = new Repo(
      repoPath,
      this.fs,
      this.git,
      async (changes) => {
        if (await admitted.promise) {
          await Promise.all(
            this.listeners.map((listener) =>
              listener.refreshed(repoPath, changes),
            ),
          );
        }
      },
      async (error) => {
        if (await admitted.promise) {
          this.statusFailed(repo, error);
        }
      },
    );
    repo.status.start();
    if ((await ignoring) || this.repoByPath.has(repoPath)) {
      admitted.resolve(false);
      return;
    }
    this.repoByPath.setItem(repoPath, repo);
    this.ordered = undefined;
    admitted.resolve(true);
  }

  private statusFailed(repo: Repo, error: unknown): void {
    // Stryker disable all: only reachable if the repo is removed while its status runs, a race we don't simulate
    if (this.repoByPath.get(repo.path) !== repo) {
      return;
    }
    // Stryker restore all
    this.logger.failed(`git status for ${repo.path}`, error);
    this.notifier.warn(
      `couldn't refresh git status for ${path.basename(repo.path)}`,
    );
  }

  private async remove(repoPath: string): Promise<void> {
    this.repoByPath.deleteItem(repoPath);
    this.ordered = undefined;
    await Promise.all(
      this.listeners.map((listener) => listener.removed(repoPath)),
    );
  }

  private async reposDeletedWith(deleted: string): Promise<void> {
    await Promise.all(
      Array.from(this.repoByPath.entries(deleted), ([, repo]) =>
        this.remove(repo.path),
      ),
    );
  }

  private gitInternalsTouched(file: string): void {
    this.findRepoContaining(file)?.gitDirTouched();
  }

  private workingTreeTouched(file: string): void {
    this.findRepoContaining(file)?.fileTouched(file);
  }
}
