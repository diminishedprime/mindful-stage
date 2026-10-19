import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "../../setup/assertions";
import { type Extension, startExtension } from "../../setup/extension";
import { OutOfBand } from "../../setup/out-of-band";
import {
  MODIFIED,
  UNTRACKED,
  MODIFIED_TWO_HUNKS,
  FALLBACK,
  DELETED,
  BINARY,
  ELSEWHERE,
} from "./files";

describe("a day of work across the polyrepo", () => {
  let sut: Extension;

  describe("while reviewing the staged work", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
      await sut.oob.deleteTrackedFile(DELETED);
      await sut.oob.modifyTrackedFile(BINARY);
      await sut.oob.modifyTrackedFile(FALLBACK);
      await sut.oob.stageFile(DELETED);
      await sut.oob.stageFile(BINARY);
      await sut.oob.stageFile(FALLBACK);
      await sut.oob.stageFile(MODIFIED);
      await sut.oob.stageFile(MODIFIED_TWO_HUNKS);
      await sut.oob.stageFile(UNTRACKED);
    });

    test("next staged hunk visits the files it can't open once per repo", async () => {
      for (let lap = 0; lap < 10; lap++) {
        await sut.run("nextStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED, 4);

        await sut.run("nextStagedHunk");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("nextStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("nextStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("nextStagedHunk");
        expect(sut.editor).toBeAt(FALLBACK, 13);
        expect(sut.errors).toInclude(
          "2 staged files in mindful-stage can't be opened, opening README.md instead.",
        );
      }
    });

    test("next staged moves file by file", async () => {
      for (let lap = 0; lap < 10; lap++) {
        await sut.run("nextStaged");
        expect(sut.editor).toBeAt(MODIFIED, 1);

        await sut.run("nextStaged");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("nextStaged");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);

        await sut.run("nextStaged");
        expect(sut.editor).toBeAt(FALLBACK, 1);
      }
    });

    test("previous staged hunk moves backwards and repeats", async () => {
      await sut.oob.open(MODIFIED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("prevStagedHunk");
        expect(sut.editor).toBeAt(FALLBACK, 13);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("prevStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("prevStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED, 4);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(FALLBACK, 13);

        await sut.run("prevStagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("prevStagedHunk");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED, 4);
      }
    });

    test("previous staged moves file by file backwards and repeats", async () => {
      await sut.oob.open(MODIFIED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("prevStaged");
        expect(sut.editor).toBeAt(FALLBACK, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);

        await sut.run("prevStaged");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED, 1);
      }
    });
  });

  describe("while reviewing the staged repos", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
      await sut.oob.deleteTrackedFile(DELETED);
      await sut.oob.modifyTrackedFile(BINARY);
      await sut.oob.modifyTrackedFile(FALLBACK);
      await sut.oob.stageFile(DELETED);
      await sut.oob.stageFile(BINARY);
      await sut.oob.stageFile(FALLBACK);
      await sut.oob.stageFile(MODIFIED);
      await sut.oob.stageFile(MODIFIED_TWO_HUNKS);
      await sut.oob.stageFile(UNTRACKED);
      await sut.oob.modifyTrackedFile(ELSEWHERE);
      await sut.oob.stageFile(ELSEWHERE);
    });

    test("next staged repo moves repo by repo", async () => {
      for (let lap = 0; lap < 10; lap++) {
        await sut.run("nextStagedRepo");
        expect(sut.editor).toBeAt(MODIFIED, 1);

        await sut.run("nextStagedRepo");
        expect(sut.editor).toBeAt(FALLBACK, 1);

        await sut.run("nextStagedRepo");
        expect(sut.editor).toBeAt(ELSEWHERE, 1);
      }
      expect(sut.notifications).toInclude("now in argo");
      expect(sut.notifications).toInclude("now in mindful-stage");
      expect(sut.notifications).toInclude("now in parallel-lab");
    });

    test("previous staged repo moves backwards and repeats", async () => {
      await sut.oob.open(MODIFIED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("prevStagedRepo");
        expect(sut.editor).toBeAt(ELSEWHERE, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(FALLBACK, 1);

        await sut.run("prevStagedRepo");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);
      }
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
