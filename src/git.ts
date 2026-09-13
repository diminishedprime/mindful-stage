import { spawn } from "child_process";
import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
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
        start: chunk.newLines === 0 ? chunk.newStart + 1 : chunk.newStart,
        count: chunk.newLines,
        from: f.from!,
        to: f.to!,
        chunk,
      })),
    );
  }

  async stage(repo: string, hunk: Hunk): Promise<void> {
    await this.withStdin(
      repo,
      ["apply", "--cached", "--unidiff-zero"],
      SimpleGitClient.patchFor(hunk),
    );
  }

  async trackedFiles(repo: string): Promise<string[]> {
    return (await this.git(repo).raw("ls-files", "-z"))
      .split("\0")
      .filter((file) => file !== "");
  }

  async hashObject(repo: string, content: string): Promise<string> {
    return (
      await this.withStdin(repo, ["hash-object", "-w", "--stdin"], content)
    ).trim();
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

  private withStdin(repo: string, args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", ["--no-optional-locks", ...args], {
        cwd: repo,
        signal: this.aborter.signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(stderr.trim())),
      );
      child.stdin.end(input);
    });
  }

  private git(repo: string): SimpleGit {
    return simpleGit({
      baseDir: repo,
      binary: ["git", "--no-optional-locks"],
      abort: this.aborter.signal,
    });
  }
}
