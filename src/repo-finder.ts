import fg from "fast-glob";
import * as path from "path";
import type { Readable } from "stream";
import type { RepoFinder } from "./types";

export class GlobRepoFinder implements RepoFinder {
  private readonly walks = new Set<Readable>();

  async findReposUnderWorkspace(root: string): Promise<string[]> {
    const walk = fg.stream("**/.git", {
      cwd: root,
      onlyDirectories: true,
      dot: true,
      absolute: true,
      ignore: ["**/node_modules", "**/.git/*"],
    }) as Readable;
    this.walks.add(walk);
    try {
      const repos: string[] = [];
      for await (const gitDir of walk) {
        repos.push(path.dirname(String(gitDir)));
      }
      return repos;
    } finally {
      this.walks.delete(walk);
    }
  }

  async dispose(): Promise<void> {
    for (const walk of this.walks) {
      walk.destroy(new Error("disposed"));
    }
  }
}
