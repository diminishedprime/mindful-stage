import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "../setup/assertions";
import { type Extension, startExtension } from "../setup/extension";

const NEW_REPO = "lab/util/new-tool";
const NEW_FILE = `${NEW_REPO}/main.ts`;
const IGNORED_REPO = "k3s/infra/argo/target/scratch";
const FILES = {
  "README.md": "new tool\n",
  "main.ts": "export {};\n",
};

describe("repos coming and going", () => {
  let sut: Extension;

  describe("while a repo comes and goes", () => {
    test("counts it while it exists and forgets it once removed", async () => {
      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.oob.initRepo(NEW_REPO, FILES);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("2? $(mindful-stage-missing-upstream)1");
      expect(sut.explorer).toMark(NEW_FILE, "?");
      expect(sut.picker).toOffer(NEW_REPO, "2? no upstream");

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(`${NEW_REPO}/README.md`, 1);

      await sut.oob.removeRepo(NEW_REPO);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.run("nextUnstaged");
      expect(sut.notifications).toInclude("no unstaged files");
      expect(sut.errors).toShowNothing();
    });
  });

  describe("while a folder stops being a repo", () => {
    test("forgets the repo but leaves its files", async () => {
      await sut.oob.createRepo(NEW_REPO, FILES);
      await sut.oob.modifyTrackedFile(NEW_FILE);
      await sut.oob.open(NEW_FILE);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M");
      expect(sut.gutter.line(NEW_FILE, 2)).toBeHatched();

      await sut.oob.removeGitDir(NEW_REPO);
      expect(sut.gutter.line(NEW_FILE, 2)).toHaveNoBand();

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.run("nextUnstaged");
      expect(sut.notifications).toInclude("no unstaged files");
    });
  });

  describe("while a repo is created inside an ignored folder", () => {
    test("leaves it alone", async () => {
      await sut.oob.initRepo(IGNORED_REPO, FILES);

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
      expect(sut.explorer).toMarkNothing();
      expect(sut.picker).toStayClosed();

      await sut.run("nextUnstaged");
      expect(sut.notifications).toInclude("no unstaged files");
      expect(sut.warnings).toShowNothing();
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
