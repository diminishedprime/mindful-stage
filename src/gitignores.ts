import * as path from "path";
import { inject, injectable } from "tsyringe";
import Gitignore, {
  type Fs as GitignoreFs,
  type Git as GitignoreGit,
} from "gitignore-fs";
import { FS, GIT } from "./di-tokens";
import type { Fs, Git } from "./types";

@injectable()
export class Gitignores {
  private readonly gitignore: Gitignore;

  constructor(@inject(FS) fs: Fs, @inject(GIT) git: Git) {
    this.gitignore = new Gitignore({
      fs: {
        stat: (file) => fs.promises.stat(file),
        readFile: async (file) =>
          new TextDecoder().decode(await fs.promises.readFile(file)),
        // Only ignoresSync needs the sync fs calls, and we never use it.
      } as GitignoreFs,
      git: {
        getCoreExcludesFile: ({ cwd }) => git.excludesFileFor(cwd),
      } as GitignoreGit,
    });
  }

  ignores(file: string): Promise<boolean> {
    return this.gitignore.ignores(file);
  }

  ignoresDirectory(dir: string): Promise<boolean> {
    return this.gitignore.ignores(`${dir}${path.sep}`);
  }

  clearCache(): void {
    this.gitignore.clearCache();
  }
}
