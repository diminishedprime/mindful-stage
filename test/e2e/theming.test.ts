import { afterEach, beforeEach, describe, expect, test } from "vitest";
import "../setup/assertions";
import { type Extension, startExtension } from "../setup/extension";
import { OutOfBand } from "../setup/out-of-band";

const EDITED = OutOfBand.ARGO_VALUES;
const THEME = "mindful-test-dark";
const BROKEN_THEME = "broken-theme";
const CIRCULAR_THEME = "circular-theme";
const OTHER_THEME = "another-theme";
const UNTRACKED = `${OutOfBand.FIRST_REPO}/extra.yaml`;

describe("colouring the gutter", () => {
  let sut: Extension;

  describe("with the contributed colours", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedLine(EDITED, 2);
      await sut.oob.deleteLines(EDITED, 6, 1);
      await sut.oob.modifyTrackedLine(EDITED, 8);
    });

    test("draws each kind of change in its default colour", async () => {
      await sut.oob.open(EDITED);

      await sut.run("nextUnstagedHunk");
      await sut.run("stageHunkAtCursor");
      expect(sut.gutter.line(EDITED, 2)).toBeSolid();
      expect(sut.gutter.line(EDITED, 2)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 2)).toBeColoured("default staged change");
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 5)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeColoured(
        "default unstaged deletion",
      );
      expect(sut.gutter.line(EDITED, 6)).toHaveWedgeOnTop();
      expect(sut.gutter.line(EDITED, 6)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 6)).toHaveWedgeColoured(
        "default unstaged deletion",
      );
      expect(sut.gutter.line(EDITED, 8)).toBeHatched();
      expect(sut.gutter.line(EDITED, 8)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 8)).toBeColoured(
        "default unstaged change",
      );
      expect(sut.gutter.line(EDITED, 1)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 1)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 7)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 7)).toHaveNoWedges();

      await sut.run("nextUnstagedHunk");
      await sut.run("stageHunkAtCursor");
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeColoured(
        "default staged deletion",
      );
      expect(sut.gutter.line(EDITED, 6)).toHaveWedgeColoured(
        "default staged deletion",
      );

      await sut.oob.deleteLines(EDITED, 1, 1);
      await sut.oob.deleteLines(EDITED, 10, 1);
      expect(sut.gutter.line(EDITED, 1)).toBeSolid();
      expect(sut.gutter.line(EDITED, 1)).toHaveWedgeOnTop();
      expect(sut.gutter.line(EDITED, 1)).toHaveWedgeColoured(
        "default unstaged deletion",
      );
      expect(sut.gutter.line(EDITED, 9)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 10)).toHaveWedgeOnTop();
    });
  });

  describe("after switching to a theme", () => {
    beforeEach(async () => {
      await sut.oob.installDefaultThemes();
      await sut.oob.modifyTrackedLine(EDITED, 2);
      await sut.oob.deleteLines(EDITED, 6, 1);
      await sut.oob.modifyTrackedLine(EDITED, 8);
    });

    test("redraws each kind of change in the theme's colours", async () => {
      await sut.oob.open(EDITED);
      await sut.run("nextUnstagedHunk");
      await sut.run("stageHunkAtCursor");
      await sut.oob.changeSetting("workbench.colorTheme", "Dark Modern");

      expect(sut.gutter.line(EDITED, 2)).toBeSolid();
      expect(sut.gutter.line(EDITED, 2)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 2)).toBeColoured("theme staged change");
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 5)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeColoured(
        "theme unstaged deletion",
      );
      expect(sut.gutter.line(EDITED, 8)).toBeHatched();
      expect(sut.gutter.line(EDITED, 8)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 8)).toBeColoured("theme unstaged change");
    });
  });

  describe("while editing without saving", () => {
    test("keeps deletion marks on the lines the editor still has", async () => {
      await sut.oob.open(EDITED);
      await sut.oob.deleteLinesWithoutSaving(EDITED, 9, 3);
      await sut.oob.deleteLines(EDITED, 12, 1);

      expect(sut.gutter.line(EDITED, 10)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 10)).toHaveWedgeColoured(
        "default unstaged deletion",
      );

      await sut.oob.save(EDITED);
      expect(sut.gutter.line(EDITED, 8)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 9)).toHaveWedgeOnTop();
      expect(sut.gutter.line(EDITED, 10)).toHaveNoWedges();
    });
  });

  describe("while turning the gutter off and on", () => {
    beforeEach(async () => {
      await sut.oob.modifyTrackedLine(EDITED, 2);
    });

    test("clears the marks and draws them again", async () => {
      await sut.oob.open(EDITED);
      expect(sut.gutter.line(EDITED, 2)).toBeHatched();

      await sut.oob.changeSetting("mindfulStage.decorations", false);
      expect(sut.gutter.line(EDITED, 2)).toHaveNoBand();

      await sut.oob.modifyTrackedLine(EDITED, 4);
      expect(sut.gutter.line(EDITED, 4)).toHaveNoBand();

      await sut.oob.changeSetting("mindfulStage.decorations", true);
      expect(sut.gutter.line(EDITED, 2)).toBeHatched();
      expect(sut.gutter.line(EDITED, 4)).toBeHatched();
    });
  });

  describe("after switching to a broken theme", () => {
    beforeEach(async () => {
      await sut.oob.installBrokenTheme(BROKEN_THEME);
    });

    test("tells the user right away that mindful stage won't work", async () => {
      await sut.oob.changeSetting("workbench.colorTheme", BROKEN_THEME);

      expect(sut.errors).toInclude(
        "couldn't read the broken-theme theme because theme.json isn't a valid theme file, mindful stage won't work until it's fixed",
      );
    });

    test("tells the user when the theme includes itself", async () => {
      await sut.oob.installCircularTheme(CIRCULAR_THEME);
      await sut.oob.changeSetting("workbench.colorTheme", CIRCULAR_THEME);

      expect(sut.errors).toInclude(
        "couldn't read the circular-theme theme because theme.json includes itself, mindful stage won't work until it's fixed",
      );
    });
  });

  describe("after customising the colours", () => {
    beforeEach(async () => {
      await sut.oob.installTheme(OTHER_THEME, "vs-dark", [
        { scope: "markup", settings: { foreground: "#999999" } },
      ]);
      await sut.oob.installTheme(THEME, "vs-dark", [
        { settings: { foreground: "#000000", background: "#ffffff" } },
        { scope: "markup.changed", settings: { foreground: "#111111" } },
        { scope: "storage", settings: { foreground: "#222222" } },
        { scope: ["markup.inserted"], settings: { foreground: "#444444" } },
        {
          scope: "markup.other, markup.deleted.diff",
          settings: { foreground: "#333333" },
        },
        { scope: "markup.deleted.diff", settings: { fontStyle: "italic" } },
        { scope: "storage.modifier", settings: { foreground: "#555555" } },
      ]);
      await sut.oob.changeSetting("workbench.colorTheme", THEME);
      await sut.oob.changeSetting("workbench.colorCustomizations", {
        "mindfulStage.stagedChange": "#AAAAAA",
        [`[${THEME}]`]: { "mindfulStage.unstagedChange": "#BBBBBB" },
      });
      await sut.oob.modifyTrackedLine(EDITED, 2);
      await sut.oob.deleteLines(EDITED, 6, 1);
      await sut.oob.modifyTrackedLine(EDITED, 8);
      await sut.oob.createUntrackedFile(OutOfBand.FIRST_REPO, "extra.yaml", 2);
    });

    test("draws the customised colours over the theme's", async () => {
      await sut.oob.open(EDITED);

      await sut.run("nextUnstagedHunk");
      await sut.run("stageHunkAtCursor");
      expect(sut.gutter.line(EDITED, 2)).toBeSolid();
      expect(sut.gutter.line(EDITED, 2)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 2)).toBeColoured("custom staged change");
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeAtTheBottom();
      expect(sut.gutter.line(EDITED, 5)).toHaveNoBand();
      expect(sut.gutter.line(EDITED, 5)).toHaveWedgeColoured(
        "theme unstaged deletion",
      );
      expect(sut.gutter.line(EDITED, 8)).toBeHatched();
      expect(sut.gutter.line(EDITED, 8)).toHaveNoWedges();
      expect(sut.gutter.line(EDITED, 8)).toBeColoured("custom unstaged change");

      await sut.oob.open(UNTRACKED);
      expect(sut.gutter.line(UNTRACKED, 1)).toBeHatched();
      expect(sut.gutter.line(UNTRACKED, 1)).toBeColoured("theme untracked");
    });
  });

  beforeEach(async () => {
    sut = await startExtension();
  });

  afterEach(async () => {
    await sut.dispose();
  });
});
