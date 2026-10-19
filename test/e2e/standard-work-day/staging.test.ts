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
  NOTE,
} from "./files";

describe("a day of work across the polyrepo", () => {
  let sut: Extension;

  describe("while staging changes one at a time", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
      await sut.oob.deleteTrackedFile(DELETED);
      await sut.oob.modifyTrackedFile(BINARY);
      await sut.oob.modifyTrackedFile(FALLBACK);
    });

    test("shows each change staged until it is ready to commit", async () => {
      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(MODIFIED, 4);
      await sut.run("stageHunkAtCursor");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 3M 1?");
      expect(sut.explorer).toMark(MODIFIED, "S");
      expect(sut.explorer).toColourBadge(MODIFIED, "staged change");
      expect(sut.gutter).toMarkStaged(MODIFIED, 4, 4);
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1M 1?");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");
      await sut.run("stageHunkAtCursor");
      expect(sut.notifications).toInclude("no unstaged hunk at cursor");

      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(UNTRACKED, 1);
      await sut.run("startTracking");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 4M");
      expect(sut.explorer).toMark(UNTRACKED, "M");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");
      expect(sut.notifications).not.toInclude(
        "'extra.yaml' is already tracked",
      );
      await sut.run("startTracking");
      expect(sut.notifications).toInclude("'extra.yaml' is already tracked");

      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(UNTRACKED, 2);
      await sut.oob.open(UNTRACKED, 3);
      await sut.run("stageHunkAtCursor");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 3M");
      expect(sut.explorer).toMark(UNTRACKED, "S");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1M");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");

      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 2);
      await sut.run("stageHunkAtCursor");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 3M");
      expect(sut.explorer).toMark(MODIFIED_TWO_HUNKS, "M");
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 2, 2);
      expect(sut.gutter).toMarkUnstaged(MODIFIED_TWO_HUNKS, 9, 9);
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1M");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");

      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);
      await sut.run("stageHunkAtCursor");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 2M");
      expect(sut.explorer).toMark(MODIFIED_TWO_HUNKS, "S");
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 2, 2);
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 9, 9);
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "ready to commit");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");

      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(FALLBACK, 13);
      expect(sut.errors).toInclude(
        "2 unstaged files in mindful-stage can't be opened, opening README.md instead.",
      );
      await sut.run("stageHunkAtCursor");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 1M");
      expect(sut.explorer).toMark(FALLBACK, "S");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "ready to commit");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 1M");

      await sut.oob.stageFile(BINARY);
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D");
      expect(sut.explorer).toMark(BINARY, "S");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "ready to commit");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D");

      await sut.oob.stageFile(DELETED);
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-ready) ready to commit");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "ready to commit");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "ready to commit");

      await sut.oob.createOneLineFile(OutOfBand.FIRST_REPO, "note.txt");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1?");

      await sut.oob.open(NOTE);
      await sut.run("startTracking");
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-ready) ready to commit");
      expect(sut.explorer).toMark(NOTE, "S");
    });
  });

  describe("while partially staged", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
      await sut.oob.deleteTrackedFile(DELETED);
      await sut.oob.modifyTrackedFile(BINARY);
      await sut.oob.modifyTrackedFile(FALLBACK);
    });

    test("keeps staged marks in place as lines are added around them", async () => {
      await sut.oob.open(MODIFIED_TWO_HUNKS);
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 9);
      await sut.run("stageHunkAtCursor");
      expect(sut.gutter).toMarkUnstaged(MODIFIED_TWO_HUNKS, 2, 2);
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 9, 9);

      await sut.oob.insertLines(MODIFIED_TWO_HUNKS, 8, 3);
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 12, 12);

      await sut.oob.insertLines(MODIFIED_TWO_HUNKS, 12, 3);

      await sut.run("nextStagedHunk");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 12);
      expect(sut.gutter).toMarkUnstaged(MODIFIED_TWO_HUNKS, 2, 2);
      expect(sut.gutter).toMarkUnstaged(MODIFIED_TWO_HUNKS, 9, 11);
      expect(sut.gutter).toMarkStaged(MODIFIED_TWO_HUNKS, 12, 12);
      expect(sut.gutter).toMarkUnstaged(MODIFIED_TWO_HUNKS, 13, 15);

      await sut.oob.open(MODIFIED_TWO_HUNKS, 3);
      await sut.run("stageHunkAtCursor");
      expect(sut.notifications).toInclude("no unstaged hunk at cursor");
    });

    test("jumps to the start of a fresh edit made around a staged line", async () => {
      await sut.oob.open(MODIFIED_TWO_HUNKS);
      await sut.run("nextUnstagedHunk");
      await sut.run("nextUnstagedHunk");
      await sut.run("stageHunkAtCursor");

      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 8);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 10);
      await sut.oob.open(MODIFIED_TWO_HUNKS);

      await sut.run("nextStagedHunk");
      expect(sut.editor).toBeAt(MODIFIED_TWO_HUNKS, 8);
    });
  });

  describe("while a file has unsaved changes", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);
    });

    test("asks to save before staging or tracking it", async () => {
      await sut.oob.open(MODIFIED, 4);
      await sut.oob.deleteLinesWithoutSaving(MODIFIED, 1, 1);
      await sut.run("stageHunkAtCursor");
      expect(sut.notifications).toInclude("save argo.yaml before staging it");

      await sut.oob.open(UNTRACKED, 1);
      await sut.oob.deleteLinesWithoutSaving(UNTRACKED, 3, 1);
      await sut.run("startTracking");
      expect(sut.notifications).toInclude("save extra.yaml before tracking it");

      await sut.oob.save(UNTRACKED);
      await sut.run("startTracking");
      await sut.statusBar.click();
      expect(sut.explorer).toMark(UNTRACKED, "M");
    });
  });

  describe("once everything is staged", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.modifyTrackedFile(FALLBACK);
      await sut.oob.stageFile(MODIFIED);
      await sut.oob.stageFile(FALLBACK);
    });

    test("each unstaged command says there are no unstaged files", async () => {
      await sut.run("nextUnstaged");
      await sut.run("prevUnstaged");
      await sut.run("nextUnstagedHunk");
      await sut.run("prevUnstagedHunk");
      expect(sut.notifications).toShow("no unstaged files", 4);
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
