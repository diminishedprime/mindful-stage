import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import "../setup/assertions";
import {
  type Extension,
  type Options,
  startExtension,
} from "../setup/extension";
import { OutOfBand } from "../setup/out-of-band";

const BLOBS = "lab/util/blobs";
const SKETCHES = "lab/fabrication/sketches";

describe("weird situations", () => {
  let sut: Extension;
  let workspaceFolders: Options["workspaceFolders"];

  describe("while a repo's git data is broken", () => {
    test("warns that its status couldn't be refreshed", async () => {
      await sut.oob.modifyTrackedFile(OutOfBand.ARGO_YAML);
      await sut.oob.open(OutOfBand.ARGO_YAML, 4);
      await sut.oob.writeGitInternal(OutOfBand.FIRST_REPO, "HEAD", "garbage\n");

      expect(sut.warnings).toInclude("couldn't refresh git status for argo");
      await expect(sut.run("stageHunkAtCursor")).rejects.toThrow(
        /not a git repository/i,
      );

      await sut.oob.open(OutOfBand.ARGO_VALUES);
      expect(sut.errors).toInclude("couldn't draw the gutter for values.yaml");
    });
  });

  describe("while a repo has no readme", () => {
    test("falls back to the first tracked file that can be opened", async () => {
      await sut.oob.createRepo(SKETCHES, {
        "art.png": "\u0000png\n",
        "notes.txt": "notes\n",
      });
      await sut.oob.modifyTrackedFile(`${SKETCHES}/art.png`);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(`${SKETCHES}/notes.txt`, 1);
      expect(sut.errors).toInclude(
        "1 unstaged file in sketches can't be opened, opening notes.txt instead.",
      );
    });
  });

  describe("while a repo's readme is deleted", () => {
    test("falls back to the first tracked file that can still be opened", async () => {
      await sut.oob.deleteTrackedFile(OutOfBand.MINDFUL_STAGE_README);

      await sut.run("nextUnstaged");
      expect(sut.editor).toBeAt(`${OutOfBand.SECOND_REPO}/LICENSE`, 1);
      expect(sut.errors).toInclude(
        "1 unstaged file in mindful-stage can't be opened, opening LICENSE instead.",
      );
    });
  });

  describe("while a picked repo has nothing that can be opened", () => {
    test("says so instead of opening anything", async () => {
      await sut.oob.initRepo(BLOBS, { "blob.bin": "\u0000blob\n" });

      sut.picker.choose(BLOBS);
      await sut.statusBar.click();
      expect(sut.notifications).toInclude("nothing can be opened in blobs");
    });
  });

  describe("while a folder holding a repo is touched", () => {
    test("keeps tracking the repo inside it", async () => {
      await sut.oob.modifyTrackedFile(OutOfBand.ARGO_YAML);
      await sut.oob.touchFolder("k3s/infra");

      await sut.statusBar.click();
      expect(sut.statusBar).toRead("1M");
      expect(sut.picker).toOffer(OutOfBand.FIRST_REPO, "1M");
    });
  });

  describe("while the workspace has no repos", () => {
    beforeAll(() => {
      workspaceFolders = (polyrepo) => [polyrepo.pathTo(OutOfBand.EMPTY)];
    });

    afterAll(() => {
      workspaceFolders = undefined;
    });

    test("finishes initializing with nothing to do", async () => {
      expect(sut.statusBar).toHaveShown("initializing...");
      expect(sut.statusBar).toRead("$(mindful-stage-clean) No changes");
    });
  });

  beforeEach(async () => {
    sut = await startExtension({ workspaceFolders });
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
