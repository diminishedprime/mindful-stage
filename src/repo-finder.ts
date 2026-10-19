import * as path from "path";
import { inject, injectable } from "tsyringe";
import { FS, GITIGNORES } from "./di-tokens";
import { Gitignores } from "./gitignores";
import type { Fs, RepoFinder } from "./types";

@injectable()
export class WalkingRepoFinder implements RepoFinder {
  private static readonly SKIPPED = new Set([".git", "node_modules"]);

  private disposed = false;

  constructor(
    @inject(FS) private readonly fs: Fs,
    @inject(GITIGNORES) private readonly gitignores: Gitignores,
  ) {}

  async findReposUnderWorkspace(
    root: string,
    found: (repo: string) => Promise<void>,
  ): Promise<void> {
    await this.visit(root, found);
  }

  // Stryker disable all: disposal is not observable through the test fakes
  async dispose(): Promise<void> {
    this.disposed = true;
  }
  // Stryker restore all

  private async visit(
    dir: string,
    found: (repo: string) => Promise<void>,
  ): Promise<void> {
    // Stryker disable all: disposal is not observable through the test fakes
    if (this.disposed) {
      return;
    }
    // Stryker restore all
    const entries = await this.fs.promises.readdir(dir, {
      withFileTypes: true,
    });
    const folders = entries.filter((entry) => entry.isDirectory());
    await Promise.all([
      folders.some((folder) => folder.name === ".git") ? found(dir) : undefined,
      ...folders
        .filter((folder) => !WalkingRepoFinder.SKIPPED.has(folder.name))
        .map(async (folder) => {
          const child = path.join(dir, folder.name);
          if (!(await this.gitignores.ignoresDirectory(child))) {
            await this.visit(child, found);
          }
        }),
    ]);
  }
}
