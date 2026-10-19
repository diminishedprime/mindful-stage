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
} from "./files";

describe("a day of work across the polyrepo", () => {
  let sut: Extension;

  describe("while moving through the ring", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
      await sut.oob.modifyTrackedFile(BINARY);
      await sut.oob.modifyTrackedFile(FALLBACK);
    });

    test("next unstaged hunk visits the files it can't open once per repo", async () => {
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(FALLBACK, 13);
      expect(sut.errors).toInclude(
        "1 unstaged file in mindful-stage can't be opened, opening README.md instead.",
      );

      await sut.oob.deleteTrackedFile(DELETED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("nextUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED, 4);

        await sut.run("nextUnstagedHunk");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("nextUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("nextUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("nextUnstagedHunk");
        expect(sut.editor).toBeAt(FALLBACK, 13);
        expect(sut.errors).toInclude(
          "2 unstaged files in mindful-stage can't be opened, opening README.md instead.",
        );
      }
    });

    test("each staged command says there are no staged files", async () => {
      await sut.run("nextStaged");
      await sut.run("prevStaged");
      await sut.run("nextStagedHunk");
      await sut.run("prevStagedHunk");
      await sut.run("nextStagedRepo");
      await sut.run("prevStagedRepo");
      expect(sut.notifications).toShow("no staged files", 6);
    });

    test("moving onto an untracked file hints at how to track it", async () => {
      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(MODIFIED, 1);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(UNTRACKED, 1);
      expect(sut.notifications).toInclude(
        "untracked file, use start tracking to stage it",
      );
      expect(sut.gutter.line(UNTRACKED, 1)).toBeHatched();
      expect(sut.gutter.line(UNTRACKED, 1)).toBeColoured("default untracked");
      expect(sut.notifications).not.toInclude("now in argo");
    });

    test("next unstaged moves file by file", async () => {
      for (let lap = 0; lap < 10; lap++) {
        await sut.run("nextUnstaged");
        expect(sut.editor).toBeAt(MODIFIED, 1);

        await sut.run("nextUnstaged");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("nextUnstaged");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);

        await sut.run("nextUnstaged");
        expect(sut.editor).toBeAt(FALLBACK, 1);
      }
      expect(sut.notifications).toShow(
        "untracked file, use start tracking to stage it",
        10,
      );

      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "app.yaml");

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(`${OutOfBand.FIRST_REPO}/app.yaml`, 1);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(MODIFIED, 1);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(UNTRACKED, 1);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);
    });

    test("a later jump wins over one still waiting on git", async () => {
      const release = sut.git.holdDiffsOf(MODIFIED);
      const waiting = sut.run("nextUnstagedHunk");

      await sut.run("prevUnstaged");
      expect(sut.editor).toBeAt(FALLBACK, 1);

      release();
      await waiting;
      expect(sut.editor).toBeAt(FALLBACK, 1);
    });

    test("picking a repo jumps to its first change", async () => {
      sut.picker.choose(OutOfBand.SECOND_REPO);
      await sut.statusBar.click();
      expect(sut.editor).toBeAt(FALLBACK, 1);
      expect(sut.errors).toShowNothing();

      sut.picker.choose(OutOfBand.FIRST_REPO);
      await sut.statusBar.click();
      expect(sut.editor).toBeAt(MODIFIED, 1);
      expect(sut.notifications).toInclude("now in argo");

      await sut.statusBar.click();
      expect(sut.editor).toBeAt(MODIFIED, 1);
    });

    test("previous unstaged hunk moves backwards and repeats", async () => {
      await sut.oob.open(MODIFIED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("prevUnstagedHunk");
        expect(sut.editor).toBeAt(FALLBACK, 13);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("prevUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("prevUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED, 4);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(FALLBACK, 13);

        await sut.run("prevUnstagedHunk");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);

        await sut.run("prevUnstagedHunk");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED, 4);
      }
    });

    test("previous unstaged moves file by file backwards and repeats", async () => {
      await sut.oob.open(MODIFIED);

      for (let lap = 0; lap < 10; lap++) {
        await sut.run("prevUnstaged");
        expect(sut.editor).toBeAt(FALLBACK, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 1);

        await sut.run("prevUnstaged");
        expect(sut.editor).toBeAt(UNTRACKED, 1);

        await sut.run("repeatLast");
        expect(sut.editor).toBeAt(MODIFIED, 1);
      }
    });
  });

  describe("while one file can't be opened", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(OutOfBand.MINDFUL_STAGE_INDEX);
      await sut.oob.modifyTrackedFile(BINARY);
    });

    test("next unstaged opens the files it can as usual", async () => {
      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(OutOfBand.MINDFUL_STAGE_INDEX, 1);
      expect(sut.errors).toShowNothing();
    });
  });

  describe("while the readme has changed", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(FALLBACK);
    });

    test("next unstaged opens the readme like any other change", async () => {
      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(FALLBACK, 1);
      expect(sut.errors).toShowNothing();

      await sut.oob.modifyTrackedFile(OutOfBand.MINDFUL_STAGE_INDEX);
      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(OutOfBand.MINDFUL_STAGE_INDEX, 1);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(FALLBACK, 1);

      await sut.run("prevUnstaged");
      expect(sut.editor).toBeAt(OutOfBand.MINDFUL_STAGE_INDEX, 1);
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
