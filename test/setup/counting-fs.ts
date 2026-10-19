import type { Fs } from "../../src/types";
import type { Timeline } from "./timeline";

export class CountingFs {
  readonly listed: string[] = [];

  constructor(
    private readonly counted: Fs,
    private readonly timeline: Timeline,
  ) {}

  get fs(): Fs {
    const { promises } = this.counted;
    return {
      promises: {
        readFile: (file) =>
          this.timeline.span("readFile", () => promises.readFile(file)),
        open: (file) => this.timeline.span("open", () => promises.open(file)),
        stat: (file) => this.timeline.span("stat", () => promises.stat(file)),
        readdir: (dir, options) => {
          this.listed.push(dir);
          return this.timeline.span("readdir", () =>
            promises.readdir(dir, options),
          );
        },
      },
    };
  }
}
