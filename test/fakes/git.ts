import type { StatusResult } from "simple-git";
import type { Diff, Git, Hunk, GitTrackedMode } from "../../src/types";

// Lets a test check that a command only interacts with the repos it should
//
//    ```ts
//    polyrepo.modifyTrackedFile(...Polyrepo.ARGO_YAML);
//    git.holdExcept(polyrepo.repoPath(Polyrepo.ARGO));
//    // can only finish if it never waits on mindful-stage's status
//    await sut.nextUnstaged();
//    ```
//
// A held repo's status never resolves, so the test will time out and fail if
// they otherwise require interaction with a held repo to finish.
export class GatedGit implements Git {
  private held = new Set<string>();
  private readonly failing = new Set<string>();
  private readonly aborter = new AbortController();
  private readonly statuses = new Map<string, number>();

  constructor(
    private readonly real: Git,
    private readonly repos: Set<string>,
  ) {}

  holdAll(): void {
    this.holdExcept();
  }

  holdExcept(...open: string[]): void {
    this.held = this.repos.difference(new Set(open));
  }

  failNext(repo: string): void {
    this.failing.add(repo);
  }

  statusCalls(repo: string): number {
    return this.statuses.get(repo) ?? 0;
  }

  async statusFor(repo: string): Promise<StatusResult> {
    this.statuses.set(repo, this.statusCalls(repo) + 1);
    if (this.failing.delete(repo)) {
      throw new Error(`simulated git failure in ${repo}`);
    }
    const result = await this.real.statusFor(repo);
    if (this.held.has(repo)) {
      const { signal } = this.aborter;
      await new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    }
    return result;
  }

  lfsPathsFor(repo: string, paths: string[]): Promise<Set<string>> {
    return this.real.lfsPathsFor(repo, paths);
  }

  hunksFor(repo: string, file: string, mode: GitTrackedMode): Promise<Diff> {
    return this.real.hunksFor(repo, file, mode);
  }

  stage(repo: string, hunk: Hunk): Promise<void> {
    return this.real.stage(repo, hunk);
  }

  trackedFilesFor(repo: string): Promise<string[]> {
    return this.real.trackedFilesFor(repo);
  }

  hashObject(repo: string, content: string): Promise<string> {
    return this.real.hashObject(repo, content);
  }

  addToIndex(repo: string, file: string, hash: string): Promise<void> {
    return this.real.addToIndex(repo, file, hash);
  }

  async dispose(): Promise<void> {
    this.aborter.abort();
    await this.real.dispose();
  }
}
