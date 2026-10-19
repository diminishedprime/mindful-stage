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

  describe("after committing the staged work", () => {
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

    test("shows the unpushed commit", async () => {
      await sut.oob.commitStaged(OutOfBand.FIRST_REPO);
      await sut.oob.commitStaged(OutOfBand.SECOND_REPO);
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-unpushed)2");
      expect(sut.explorer).toMarkNothingOn(MODIFIED);
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1 unpushed commit");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1 unpushed commit");
    });

    test("counts every unpushed commit", async () => {
      await sut.oob.commitStaged(OutOfBand.FIRST_REPO);
      await sut.oob.commitStaged(OutOfBand.SECOND_REPO);
      await sut.oob.modifyTrackedFile(MODIFIED);
      await sut.oob.stageFile(MODIFIED);
      await sut.oob.commitStaged(OutOfBand.FIRST_REPO);
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-unpushed)3");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2 unpushed commits");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1 unpushed commit");
    });
  });

  describe("after pushing the commits", () => {
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
      await sut.oob.commitStaged(OutOfBand.FIRST_REPO);
      await sut.oob.commitStaged(OutOfBand.SECOND_REPO);
    });

    test("goes back to how it was before any work", async () => {
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-unpushed)2");

      await sut.oob.push(OutOfBand.FIRST_REPO);
      await sut.oob.push(OutOfBand.SECOND_REPO);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.run("nextUnstaged");
      expect(sut.notifications).toInclude("no unstaged files");
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
