import type { RepoFinder } from "../../src/types";

// Lets a test check that a command does not walk the filesystem when it
// should not need to
//
//    ```ts
//    await sut.nextUnstaged();
//    finder.hold();
//    // can only finish if it never walks the filesystem again
//    await sut.nextUnstaged();
//    ```
//
// A held find never resolves, so the test will time out and fail if the
// command otherwise requires a walk to finish.
export class GatedRepoFinder implements RepoFinder {
  private held = false;
  private readonly aborter = new AbortController();

  constructor(private readonly real: RepoFinder) {}

  hold(): void {
    this.held = true;
  }

  async findReposUnderWorkspace(root: string): Promise<string[]> {
    const result = await this.real.findReposUnderWorkspace(root);
    if (this.held) {
      const { signal } = this.aborter;
      await new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    }
    return result;
  }

  async dispose(): Promise<void> {
    this.aborter.abort();
    await this.real.dispose();
  }
}
