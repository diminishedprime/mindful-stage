import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import parseDiff from "parse-diff";
import { type Git, type Hunk, Mode } from "./types";

export class SimpleGitClient implements Git {
  private readonly aborter = new AbortController();

  status(repo: string): Promise<StatusResult> {
    return this.git(repo).status();
  }

  async lfsPaths(repo: string, paths: string[]): Promise<Set<string>> {
    return new Set(
      (await this.git(repo).raw("check-attr", "filter", "--", ...paths))
        .split("\n")
        .filter((line) => line.endsWith(": filter: lfs"))
        .map((line) => line.slice(0, -": filter: lfs".length)),
    );
  }

  async hunks(repo: string, file: string, mode: Mode): Promise<Hunk[]> {
    const diff = await this.git(repo).diff([
      "-U0",
      ...(mode === Mode.Staged ? ["--cached"] : []),
      "--",
      file,
    ]);
    return parseDiff(diff).flatMap((f) =>
      f.chunks.map((chunk) => ({
        start: Math.max(1, chunk.newStart),
        count: chunk.newLines,
        from: f.from!,
        to: f.to!,
        chunk,
      })),
    );
  }

  async stage(repo: string, hunk: Hunk): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mindful-stage-"));
    const file = path.join(dir, "hunk.patch");
    try {
      await fs.writeFile(file, SimpleGitClient.patchFor(hunk));
      await this.git(repo).applyPatch(file, ["--cached", "--unidiff-zero"]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async trackedFiles(repo: string): Promise<string[]> {
    return (await this.git(repo).raw("ls-files", "-z"))
      .split("\0")
      .filter((file) => file !== "");
  }

  async hashObject(repo: string, content: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mindful-stage-"));
    const file = path.join(dir, "blob");
    try {
      await fs.writeFile(file, content);
      return (await this.git(repo).hashObject(file, true)).trim();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async addToIndex(repo: string, file: string, hash: string): Promise<void> {
    await this.git(repo).raw(
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${hash},${file}`,
    );
  }

  async dispose(): Promise<void> {
    this.aborter.abort();
  }

  private static patchFor(hunk: Hunk): string {
    return [
      `--- a/${hunk.from}`,
      `+++ b/${hunk.to}`,
      hunk.chunk.content,
      ...hunk.chunk.changes.map((change) => change.content),
      "",
    ].join("\n");
  }

  private git(repo: string): SimpleGit {
    return simpleGit({
      baseDir: repo,
      binary: ["git", "--no-optional-locks"],
      abort: this.aborter.signal,
    });
  }
}
