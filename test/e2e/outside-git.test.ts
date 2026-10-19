import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "../setup/assertions";
import { type Extension, startExtension } from "../setup/extension";

const SCRATCH = "lab/util/notes.md";

describe("acting from outside of git", () => {
  let sut: Extension;

  describe("with no editor open", () => {
    test("says there is no active editor", async () => {
      await sut.run("stageHunkAtCursor");
      expect(sut.notifications).toInclude("no active editor");

      await sut.run("startTracking");
      expect(sut.notifications).toInclude("no active editor");
    });
  });

  describe("in a folder that is not a repo", () => {
    beforeEach(async () => {
      await sut.oob.createScratchFile(SCRATCH);
      await sut.oob.open(SCRATCH);
    });

    test("says the file is not inside a repo", async () => {
      await sut.run("stageHunkAtCursor");
      expect(sut.notifications).toInclude("not inside a repo");

      await sut.run("startTracking");
      expect(sut.notifications).toInclude("not inside a repo");
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
