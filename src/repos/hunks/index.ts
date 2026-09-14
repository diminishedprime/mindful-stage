import type { Git } from "../../types";
import { FileHunks } from "./file-hunks";

export class Hunks {
  private readonly byFile = new Map<string, FileHunks>();

  constructor(
    private readonly repo: string,
    private readonly git: Git,
  ) {}

  forFile(file: string): FileHunks {
    let hunks = this.byFile.get(file);
    if (hunks === undefined) {
      hunks = new FileHunks(this.repo, file, this.git);
      this.byFile.set(file, hunks);
    }
    return hunks;
  }

  invalidateFile(file: string): void {
    this.byFile.delete(file);
  }

  invalidateRepo(): void {
    this.byFile.clear();
  }
}
