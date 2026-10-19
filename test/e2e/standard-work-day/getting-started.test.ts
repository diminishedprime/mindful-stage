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

  describe("before navigating anywhere", () => {
    test("has nothing to repeat", async () => {
      await sut.run("repeatLast");
      expect(sut.notifications).toInclude("nothing to repeat yet");

      await sut.run("nextUnstagedHunk");
      expect(sut.notifications).toInclude("no unstaged files");

      await sut.run("nextStagedRepo");
      expect(sut.notifications).toInclude("no staged files");
    });
  });

  describe("before any work", () => {
    test("shows nothing to do", async () => {
      expect(sut.statusBar).toHaveShown("initializing...");
      expect(sut.git).toHaveRefreshedStatus(4);
      expect(sut.files).toNeverLookInside("node_modules");
      expect(sut.files).toNeverLookInside(".git");

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.run("nextUnstaged");
      expect(sut.notifications).toInclude("no unstaged files");
    });
  });

  describe("while changing what git ignores", () => {
    test("counts log files once they are no longer ignored", async () => {
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "debug.log");

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");

      await sut.oob.deleteLines(`${OutOfBand.FIRST_REPO}/.gitignore`, 1, 1);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M 1?");
      expect(sut.explorer).toMark(`${OutOfBand.FIRST_REPO}/debug.log`, "?");

      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "other.log");

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M 2?");
      expect(sut.explorer).toMark(`${OutOfBand.FIRST_REPO}/other.log`, "?");
    });

    test("stops counting a file once it is ignored", async () => {
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "notes.txt");

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1?");
      expect(sut.explorer).toMark(`${OutOfBand.FIRST_REPO}/notes.txt`, "?");

      await sut.oob.appendLine(
        `${OutOfBand.FIRST_REPO}/.gitignore`,
        "notes.txt",
      );

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M");
      expect(sut.explorer).toMarkNothingOn(`${OutOfBand.FIRST_REPO}/notes.txt`);
    });
  });

  describe("while ignored and internal git files change", () => {
    test("only refreshes for changes that matter", async () => {
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "warmup.log");
      await sut.oob.writeGitInternal(
        OutOfBand.FIRST_REPO,
        "info/exclude",
        "scratch.txt\n",
      );
      sut.git.startCounting();

      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "scratch.txt");
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "build.log");
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "test.log");
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "notes.swp");
      await sut.oob.writeObject(OutOfBand.FIRST_REPO, "churn 1\n");
      await sut.oob.writeObject(OutOfBand.FIRST_REPO, "churn 2\n");
      await sut.oob.writeGitInternal(OutOfBand.FIRST_REPO, "info/refs", "");

      expect(sut.git).toHaveRefreshedStatus(0);

      await sut.oob.modifyTrackedFile(MODIFIED);

      expect(sut.git).toHaveRefreshedStatus(1);

      await sut.oob.modifyTrackedFiles([
        MODIFIED,
        OutOfBand.ARGO_VALUES,
        `${OutOfBand.FIRST_REPO}/kustomization.yaml`,
      ]);

      expect(sut.git).toHaveRefreshedStatus(3);
    });
  });

  describe("while working in a second workspace folder", () => {
    test("offers its repo by the folder's name", async () => {
      await sut.oob.modifyTrackedFile(OutOfBand.STANDALONE_MAIN);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M");
      expect(sut.picker).toOffer("standalone", "1M");
    });
  });

  describe("while making edits", () => {
    test("shows each change as it happens", async () => {
      await sut.oob.modifyTrackedFile(MODIFIED);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M");
      expect(sut.explorer).toMark(MODIFIED, "M");
      expect(sut.explorer).toColourBadge(MODIFIED, "unstaged change");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1M");

      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 2);
      await sut.oob.modifyTrackedLine(MODIFIED_TWO_HUNKS, 9);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("2M");
      expect(sut.explorer).toMark(MODIFIED_TWO_HUNKS, "M");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M");

      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 3);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("2M 1?");
      expect(sut.explorer).toMark(UNTRACKED, "?");
      expect(sut.explorer).toColourBadge(UNTRACKED, "untracked");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M 1?");

      await sut.oob.deleteTrackedFile(DELETED);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 2M 1?");
      expect(sut.explorer).toMark(DELETED, "D");
      expect(sut.explorer).toColourBadge(DELETED, "unstaged deletion");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M 1?");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D");

      await sut.oob.modifyTrackedFile(BINARY);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 3M 1?");
      expect(sut.explorer).toMark(BINARY, "M");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M 1?");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 1M");

      await sut.oob.modifyTrackedFile(FALLBACK);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1D 4M 1?");
      expect(sut.explorer).toMark(FALLBACK, "M");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "2M 1?");
      expect(sut.picker).toOffer(OutOfBand.SECOND_REPO, "1D 2M");
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
