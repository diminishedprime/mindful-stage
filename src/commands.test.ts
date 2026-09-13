import "reflect-metadata";
import { container } from "tsyringe";
import { describe, expect, test as base } from "vitest";
import {
  Commands,
  EDITOR,
  GIT,
  GIT_REFRESHER,
  NOTIFIER,
  PICKER,
  READMES,
  REPO_FINDER,
  ROOTS,
  STATUS_BAR,
  WATCHER,
} from "./commands";
import { GlobRepoFinder } from "./repo-finder";
import { SimpleGitClient } from "./git";
import type {
  Editor,
  Git,
  GitRefresher,
  Notifier,
  Picker,
  RepoFinder,
  StatusBar,
  Watcher,
} from "./types";
import { FakeEditor } from "../test/fakes/editor";
import { GatedGit } from "../test/fakes/git";
import { FakeGitRefresher } from "../test/fakes/git-refresher";
import { FakeNotifier } from "../test/fakes/notifier";
import { FakePicker } from "../test/fakes/picker";
import { GatedRepoFinder } from "../test/fakes/repo-finder";
import { FakeStatusBar } from "../test/fakes/status-bar";
import { SettlingWatcher } from "../test/fakes/watcher";
import { ParcelWatcher } from "../test/parcel-watcher";
import { Polyrepo } from "../test/polyrepo";

const first = Polyrepo.ARGO_YAML;
const middle = Polyrepo.ARGO_KUSTOMIZATION;
const last = Polyrepo.MINDFUL_STAGE_README;

const test = base.extend<{
  polyrepo: Polyrepo;
  addedFolder: Polyrepo;
  roots: string[];
  editor: FakeEditor;
  notifier: FakeNotifier;
  git: GatedGit;
  gitRefresher: FakeGitRefresher;
  finder: GatedRepoFinder;
  picker: FakePicker;
  statusBar: FakeStatusBar;
  watcher: SettlingWatcher;
  sut: Commands;
  t: {
    polyrepo: Polyrepo;
    editor: FakeEditor;
    notifier: FakeNotifier;
    git: GatedGit;
    gitRefresher: FakeGitRefresher;
    finder: GatedRepoFinder;
    picker: FakePicker;
    statusBar: FakeStatusBar;
    watcher: SettlingWatcher;
    sut: Commands;
  };
}>({
  polyrepo: async ({}, use) => {
    const polyrepo = await Polyrepo.create();
    await use(polyrepo);
    polyrepo.dispose();
  },
  addedFolder: async ({ watcher }, use) => {
    const addedFolder = await Polyrepo.create();
    addedFolder.attach(watcher);
    await use(addedFolder);
    addedFolder.dispose();
  },
  roots: async ({ polyrepo }, use) => {
    await use([polyrepo.root]);
  },
  editor: async ({}, use) => {
    await use(new FakeEditor());
  },
  notifier: async ({}, use) => {
    await use(new FakeNotifier());
  },
  git: async ({ polyrepo }, use) => {
    await use(new GatedGit(new SimpleGitClient(), polyrepo.repoPaths()));
  },
  gitRefresher: async ({}, use) => {
    await use(new FakeGitRefresher());
  },
  watcher: async ({}, use) => {
    await use(new SettlingWatcher(new ParcelWatcher()));
  },
  finder: async ({}, use) => {
    await use(new GatedRepoFinder(new GlobRepoFinder()));
  },
  picker: async ({}, use) => {
    await use(new FakePicker());
  },
  statusBar: async ({}, use) => {
    await use(new FakeStatusBar());
  },
  sut: async (
    {
      roots,
      editor,
      notifier,
      git,
      gitRefresher,
      finder,
      picker,
      statusBar,
      watcher,
    },
    use,
  ) => {
    const sut = container
      .createChildContainer()
      .register<Editor>(EDITOR, { useValue: editor })
      .register<Notifier>(NOTIFIER, { useValue: notifier })
      .register<Git>(GIT, { useValue: git })
      .register<GitRefresher>(GIT_REFRESHER, { useValue: gitRefresher })
      .register<Picker>(PICKER, { useValue: picker })
      .register<RepoFinder>(REPO_FINDER, { useValue: finder })
      .register<StatusBar>(STATUS_BAR, { useValue: statusBar })
      .register<string[]>(ROOTS, { useValue: roots })
      .register<Watcher>(WATCHER, { useValue: watcher })
      .resolve(Commands);
    await sut.ready();
    await use(sut);
    await sut.dispose();
  },
  t: async (
    {
      polyrepo,
      editor,
      notifier,
      git,
      gitRefresher,
      finder,
      picker,
      statusBar,
      watcher,
      sut,
    },
    use,
  ) => {
    polyrepo.attach(watcher);
    await use({
      polyrepo,
      editor,
      notifier,
      git,
      gitRefresher,
      finder,
      picker,
      statusBar,
      watcher,
      sut,
    });
  },
});

describe.concurrent("Commands", () => {
  describe.each([
    {
      mode: "unstaged",
      change: "modifyTrackedFile",
      next: "nextUnstaged",
      prev: "prevUnstaged",
    },
    {
      mode: "staged",
      change: "stageTrackedChange",
      next: "nextStaged",
      prev: "prevStaged",
    },
  ] as const)("$mode files", ({ mode, change, next, prev }) => {
    describe.each([
      {
        command: next,
        fromNowhere: first,
        fromMiddle: last,
        wrapFrom: last,
        wrapTo: first,
      },
      {
        command: prev,
        fromNowhere: last,
        fromMiddle: first,
        wrapFrom: first,
        wrapTo: last,
      },
    ])("$command", ({ command, fromNowhere, fromMiddle, wrapFrom, wrapTo }) => {
      test("from nowhere opens the end of the ring", async ({ t }) => {
        await t.polyrepo[change](first);
        await t.polyrepo[change](middle);
        await t.polyrepo[change](last);

        await t.sut[command]();

        expect(t.editor.opened.map((p) => p.path)).toEqual([
          t.polyrepo.pathTo(fromNowhere),
        ]);
      });

      test("from a changed file opens the adjacent changed file in path order", async ({
        t,
      }) => {
        await t.polyrepo[change](first);
        await t.polyrepo[change](middle);
        await t.polyrepo[change](last);
        await t.editor.open(t.polyrepo.pathTo(middle));

        await t.sut[command]();

        expect(t.editor.opened.map((p) => p.path)).toEqual([
          t.polyrepo.pathTo(middle),
          t.polyrepo.pathTo(fromMiddle),
        ]);
      });

      test("from the end of the ring wraps around", async ({ t }) => {
        await t.polyrepo[change](first);
        await t.polyrepo[change](middle);
        await t.polyrepo[change](last);
        await t.editor.open(t.polyrepo.pathTo(wrapFrom));

        await t.sut[command]();

        expect(t.editor.opened.map((p) => p.path)).toEqual([
          t.polyrepo.pathTo(wrapFrom),
          t.polyrepo.pathTo(wrapTo),
        ]);
      });

      test("with no changes anywhere notifies and opens nothing", async ({
        t,
      }) => {
        await t.sut[command]();

        expect(t.editor.opened).toEqual([]);
        expect(t.notifier.notices).toEqual([`no ${mode} files`]);
      });
    });
  });

  describe.each([
    { command: "nextUnstaged" as const },
    { command: "prevUnstaged" as const },
  ])("$command", ({ command }) => {
    test("includes untracked files in the ring", async ({ t }) => {
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "new.yaml");

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(`${Polyrepo.ARGO}/new.yaml`),
      ]);
    });

    test("lands on a deleted file by showing the repo's first tracked text file", async ({
      t,
    }) => {
      await t.polyrepo.deleteTrackedFile(Polyrepo.ARGO_YAML);

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(`${Polyrepo.ARGO}/.gitignore`),
      ]);
      expect(t.notifier.errors).toEqual([
        "argo.yaml was deleted, opening first tracked file so you can stage the deletion manually.",
      ]);
    });

    test("with every tracked file deleted, says so instead of landing", async ({
      t,
    }) => {
      for (const file of [".gitignore", "argo.yaml", "kustomization.yaml"]) {
        await t.polyrepo.deleteTrackedFile(`${Polyrepo.ARGO}/${file}`);
      }

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.errors).toEqual([
        expect.stringContaining("nothing in argo can be opened instead"),
      ]);
    });

    test("skips files tracked by git-lfs", async ({ t }) => {
      await t.polyrepo.trackWithLfs(Polyrepo.ARGO, "*.png", "logo.png");
      await t.polyrepo.modifyTrackedFile(`${Polyrepo.ARGO}/logo.png`);

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no unstaged files"]);
    });

    test("lands on a binary file by showing the repo's first tracked text file", async ({
      t,
    }) => {
      await t.polyrepo.createUntrackedBinaryFile(Polyrepo.ARGO, "heap.png");

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(`${Polyrepo.ARGO}/.gitignore`),
      ]);
      expect(t.notifier.errors).toEqual([
        "can't open heap.png, opening first tracked file so you can handle heap.png manually.",
      ]);
    });

    test("skips git-lfs files whose names contain spaces", async ({ t }) => {
      await t.polyrepo.trackWithLfs(Polyrepo.ARGO, "*.png", "my logo.png");
      await t.polyrepo.modifyTrackedFile(`${Polyrepo.ARGO}/my logo.png`);

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no unstaged files"]);
    });

    test("skips files ignored by the user's global git ignore", async ({
      t,
    }) => {
      await t.polyrepo.createGloballyIgnoredFile(
        Polyrepo.ARGO,
        "settings.local.json",
      );

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no unstaged files"]);
    });

    test("skips gitignored files", async ({ t }) => {
      await t.polyrepo.createIgnoredFile(Polyrepo.ARGO, "debug.log");

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no unstaged files"]);
    });
  });

  describe.each([
    {
      mode: "unstaged",
      changeLine: "modifyTrackedLine",
      next: "nextUnstagedHunk",
      prev: "prevUnstagedHunk",
    },
    {
      mode: "staged",
      changeLine: "stageTrackedLine",
      next: "nextStagedHunk",
      prev: "prevStagedHunk",
    },
  ] as const)("$mode hunks", ({ mode, changeLine, next, prev }) => {
    describe.each([
      {
        command: next,
        edge: 1,
        hunkFromEdge: 4,
        spillFrom: { file: last, line: 4 },
        spillTo: { file: first, line: 2 },
      },
      {
        command: prev,
        edge: 12,
        hunkFromEdge: 9,
        spillFrom: { file: first, line: 2 },
        spillTo: { file: last, line: 4 },
      },
    ])("$command", ({ command, edge, hunkFromEdge, spillFrom, spillTo }) => {
      test("from the edge of a file moves to its nearest hunk", async ({
        t,
      }) => {
        await t.polyrepo[changeLine](last, 4);
        await t.polyrepo[changeLine](last, 9);
        await t.editor.open(t.polyrepo.pathTo(last), edge);

        await t.sut[command]();

        expect(t.editor.opened).toEqual([
          { path: t.polyrepo.pathTo(last), line: edge },
          { path: t.polyrepo.pathTo(last), line: hunkFromEdge },
        ]);
      });

      test("past the last hunk of a file moves to the nearest hunk of the next changed file", async ({
        t,
      }) => {
        await t.polyrepo[changeLine](first, 2);
        await t.polyrepo[changeLine](last, 4);
        await t.editor.open(t.polyrepo.pathTo(spillFrom.file), spillFrom.line);

        await t.sut[command]();

        expect(t.editor.opened).toEqual([
          { path: t.polyrepo.pathTo(spillFrom.file), line: spillFrom.line },
          { path: t.polyrepo.pathTo(spillTo.file), line: spillTo.line },
        ]);
      });

      test("with no changes anywhere notifies and stays put", async ({ t }) => {
        await t.editor.open(t.polyrepo.pathTo(last), 1);

        await t.sut[command]();

        expect(t.editor.opened.map((p) => p.path)).toEqual([
          t.polyrepo.pathTo(last),
        ]);
        expect(t.notifier.notices).toEqual([`no ${mode} files`]);
      });
    });
  });

  describe("hunk navigation spilling onto a binary file", () => {
    test("shows the repo's first tracked text file instead", async ({ t }) => {
      await t.polyrepo.createUntrackedBinaryFile(Polyrepo.ARGO, "heap.png");
      await t.polyrepo.modifyTrackedLine(last, 4);
      await t.editor.open(t.polyrepo.pathTo(last), 4);

      await t.sut.nextUnstagedHunk();

      expect(t.editor.opened.at(-1)?.path).toBe(
        t.polyrepo.pathTo(`${Polyrepo.ARGO}/.gitignore`),
      );
      expect(t.notifier.errors).toEqual([
        "can't open heap.png, opening first tracked file so you can handle heap.png manually.",
      ]);
    });
  });

  describe.each(READMES)("a repo whose readme is named %s", (readme) => {
    test("stands in for a file that can't be opened", async ({ t }) => {
      await t.polyrepo.cloneRepo(Polyrepo.CERT_MANAGER, {
        ".gitignore": "*.log\n",
        [readme]: "cert-manager\n",
        "kustomization.yaml": "resources:\n  - cert-manager.yaml\n",
      });
      await t.polyrepo.deleteTrackedFile(Polyrepo.CERT_MANAGER_KUSTOMIZATION);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(`${Polyrepo.CERT_MANAGER}/${readme}`),
      ]);
    });
  });

  describe("picking a repo from the status bar", () => {
    test("offers every repo with outstanding work and its state", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.commitWithoutPushing(
        Polyrepo.MINDFUL_STAGE,
        "README.md",
      );

      await t.sut.pickRepo();

      expect(t.picker.choices.map((c) => [c.label, c.detail])).toEqual([
        [Polyrepo.ARGO, "1M"],
        [Polyrepo.MINDFUL_STAGE, "1 unpushed commits"],
      ]);
    });

    test("lands on the chosen repo's first unstaged file", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.modifyTrackedFile(last);
      t.picker.picks(Polyrepo.MINDFUL_STAGE);

      await t.sut.pickRepo();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(last),
      ]);
    });

    test("lands on a readme when the repo only has unpushed commits", async ({
      t,
    }) => {
      await t.polyrepo.commitWithoutPushing(
        Polyrepo.MINDFUL_STAGE,
        "README.md",
      );
      t.picker.picks(Polyrepo.MINDFUL_STAGE);

      await t.sut.pickRepo();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(Polyrepo.MINDFUL_STAGE_README),
      ]);
    });

    test("declining the pick opens nothing", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);

      await t.sut.pickRepo();

      expect(t.editor.opened).toEqual([]);
    });

    test("with nothing outstanding says so in the pick itself", async ({
      t,
    }) => {
      await t.sut.pickRepo();

      expect(t.picker.choices.map((c) => c.label)).toEqual([
        "No outstanding changes.",
      ]);
      expect(t.notifier.notices).toEqual([]);
    });

    test("choosing the nothing-outstanding entry opens nothing", async ({
      t,
    }) => {
      t.picker.picksFirst();

      await t.sut.pickRepo();

      expect(t.editor.opened).toEqual([]);
    });
  });

  describe("hunks made only of deleted lines", () => {
    test("land on the line that now occupies the gap", async ({ t }) => {
      await t.polyrepo.deleteTrackedLines(last, 4, 5);
      await t.editor.open(t.polyrepo.pathTo(last), 1);

      await t.sut.nextUnstagedHunk();

      expect(t.editor.opened.at(-1)).toEqual({
        path: t.polyrepo.pathTo(last),
        line: 4,
      });
    });

    test("at the top of a file land on its first line", async ({ t }) => {
      await t.polyrepo.deleteTrackedLines(last, 1, 2);
      await t.editor.open(t.polyrepo.pathTo(first), 1);

      await t.sut.nextUnstagedHunk();

      expect(t.editor.opened.at(-1)).toEqual({
        path: t.polyrepo.pathTo(last),
        line: 1,
      });
    });
  });

  describe("edits to files git ignores", () => {
    test("do not refresh the repo", async ({ t }) => {
      const repo = t.polyrepo.repoPath(Polyrepo.ARGO);
      const before = t.git.statusCalls(repo);

      await t.polyrepo.createIgnoredFile(Polyrepo.ARGO, "debug.log");

      expect(t.git.statusCalls(repo)).toBe(before);
    });
  });

  describe("after git fails once for a repo", () => {
    test("the next change in that repo is still found", async ({ t }) => {
      t.git.failNext(t.polyrepo.repoPath(Polyrepo.ARGO));
      await t.polyrepo.modifyTrackedFile(middle);
      await t.polyrepo.modifyTrackedFile(first);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
      ]);
    });
  });

  describe("when every change has been staged", () => {
    test("unstaged navigation nudges towards committing", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);

      await t.sut.nextUnstaged();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual([
        "no remaining unstaged files, use `mindfulStage.nextStagedRepo` to navigate through repos ready to be committed.",
      ]);
    });

    test("unstaged hunk navigation nudges too", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);
      await t.editor.open(t.polyrepo.pathTo(first), 1);

      await t.sut.nextUnstagedHunk();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
      ]);
      expect(t.notifier.notices).toEqual([
        "no remaining unstaged files, use `mindfulStage.nextStagedRepo` to navigate through repos ready to be committed.",
      ]);
    });
  });

  describe.each([
    {
      command: "nextStagedRepo" as const,
      fromNowhere: middle,
      fromArgo: last,
      fromMindfulStage: first,
    },
    {
      command: "prevStagedRepo" as const,
      fromNowhere: last,
      fromArgo: last,
      fromMindfulStage: middle,
    },
  ])("$command", ({ command, fromNowhere, fromArgo, fromMindfulStage }) => {
    test("from nowhere opens a staged file at the end of the repo ring", async ({
      t,
    }) => {
      await t.polyrepo.stageTrackedChange(middle);
      await t.polyrepo.stageTrackedChange(last);

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(fromNowhere),
      ]);
    });

    test("from a repo with staged changes opens the adjacent such repo", async ({
      t,
    }) => {
      await t.polyrepo.stageTrackedChange(first);
      await t.polyrepo.stageTrackedChange(middle);
      await t.polyrepo.stageTrackedChange(last);
      await t.editor.open(t.polyrepo.pathTo(first));

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(fromArgo),
      ]);
    });

    test("wraps around", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);
      await t.polyrepo.stageTrackedChange(middle);
      await t.polyrepo.stageTrackedChange(last);
      await t.editor.open(t.polyrepo.pathTo(last));

      await t.sut[command]();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(last),
        t.polyrepo.pathTo(fromMindfulStage),
      ]);
    });

    test("with nothing staged anywhere notifies and opens nothing", async ({
      t,
    }) => {
      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no staged files"]);
    });
  });

  describe("landing on an untracked file", () => {
    test("hints at start tracking", async ({ t }) => {
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "new.yaml");

      await t.sut.nextUnstaged();

      expect(t.notifier.notices).toEqual([
        "untracked file, use start tracking to stage it",
      ]);
    });
  });

  describe("crossing into another repo", () => {
    test("announces the repo landed in", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.modifyTrackedFile(last);
      await t.editor.open(t.polyrepo.pathTo(first));

      await t.sut.nextUnstaged();

      expect(t.notifier.notices).toEqual(["now in mindful-stage"]);
    });

    test("announces it on a hunk spill-over too", async ({ t }) => {
      await t.polyrepo.modifyTrackedLine(first, 2);
      await t.polyrepo.modifyTrackedLine(last, 4);
      await t.editor.open(t.polyrepo.pathTo(first), 2);

      await t.sut.nextUnstagedHunk();

      expect(t.notifier.notices).toEqual(["now in mindful-stage"]);
    });
  });

  describe("repeatLast", () => {
    test("replays the last navigation", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.modifyTrackedFile(middle);
      await t.polyrepo.modifyTrackedFile(last);
      await t.sut.nextUnstaged();

      await t.sut.repeatLast();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(middle),
      ]);
    });

    test("with nothing to repeat does nothing", async ({ t }) => {
      await t.sut.repeatLast();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual([]);
      expect(t.notifier.errors).toEqual([]);
    });
  });

  describe("startTracking", () => {
    test("stages only the first line of an untracked file", async ({ t }) => {
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "new.yaml", 3);
      const file = t.polyrepo.pathTo(`${Polyrepo.ARGO}/new.yaml`);
      await t.editor.open(file, 1);

      await t.sut.startTracking();

      await t.sut.nextUnstagedHunk();
      expect(t.editor.opened.at(-1)).toEqual({ path: file, line: 2 });
      await t.sut.nextStaged();
      expect(t.editor.opened.at(-1)?.path).toBe(file);
      expect(t.gitRefresher.refreshed).toEqual([
        t.polyrepo.repoPath(Polyrepo.ARGO),
      ]);
    });

    test("refuses a file that is already tracked", async ({ t }) => {
      await t.editor.open(t.polyrepo.pathTo(first), 1);

      await t.sut.startTracking();

      expect(t.notifier.errors).toEqual(["'argo.yaml' is already tracked"]);
      await t.sut.nextStaged();
      expect(t.notifier.notices).toEqual(["no staged files"]);
    });
  });

  describe("stageHunkAtCursor", () => {
    test("removes the hunk under the cursor from unstaged navigation", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedLine(last, 4);
      await t.polyrepo.modifyTrackedLine(last, 9);
      await t.editor.open(t.polyrepo.pathTo(last), 4);

      await t.sut.stageHunkAtCursor();

      await t.editor.open(t.polyrepo.pathTo(last), 1);
      await t.sut.nextUnstagedHunk();
      expect(t.editor.opened.at(-1)).toEqual({
        path: t.polyrepo.pathTo(last),
        line: 9,
      });
      expect(t.gitRefresher.refreshed).toEqual([
        t.polyrepo.repoPath(Polyrepo.MINDFUL_STAGE),
      ]);
    });

    test("stages a hunk in a file inside a subdirectory", async ({ t }) => {
      const file = Polyrepo.MINDFUL_STAGE_INDEX;
      await t.polyrepo.modifyTrackedLine(file, 4);
      await t.polyrepo.modifyTrackedLine(file, 9);
      await t.editor.open(t.polyrepo.pathTo(file), 4);

      await t.sut.stageHunkAtCursor();

      await t.editor.open(t.polyrepo.pathTo(file), 1);
      await t.sut.nextUnstagedHunk();
      expect(t.editor.opened.at(-1)).toEqual({
        path: t.polyrepo.pathTo(file),
        line: 9,
      });
    });

    test("with the cursor outside every hunk notifies and stages nothing", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedLine(last, 4);
      await t.polyrepo.modifyTrackedLine(last, 9);
      await t.editor.open(t.polyrepo.pathTo(last), 1);

      await t.sut.stageHunkAtCursor();

      expect(t.notifier.notices).toEqual(["no unstaged hunk at cursor"]);
      await t.sut.nextUnstagedHunk();
      expect(t.editor.opened.at(-1)).toEqual({
        path: t.polyrepo.pathTo(last),
        line: 4,
      });
    });
  });

  describe("performance", () => {
    test("the first navigation does not wait on repos beyond the one it lands in", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      t.git.holdExcept(t.polyrepo.repoPath(Polyrepo.ARGO));

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
      ]);
    });

    test("a later navigation does not wait on git at all", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.sut.nextUnstaged();
      t.git.holdAll();

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(first),
      ]);
    });

    test("a later navigation does not walk the filesystem for repos", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.sut.nextUnstaged();
      t.finder.hold();

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(first),
      ]);
    });

    test("once ready, the first navigation does not wait on git", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(last);
      await t.sut.ready();
      t.git.holdAll();

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(last),
      ]);
    });
  });

  describe("after a navigation", () => {
    test("an edit in another repo is found by the next navigation", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.sut.nextUnstaged();
      await t.polyrepo.modifyTrackedFile(last);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(last),
      ]);
    });

    test("a fully staged file leaves the unstaged ring", async ({ t }) => {
      await t.polyrepo.modifyTrackedLine(first, 2);
      await t.sut.nextUnstaged();
      await t.sut.nextUnstagedHunk();
      await t.sut.stageHunkAtCursor();
      await t.watcher.settle(t.polyrepo.pathTo(`${Polyrepo.ARGO}/.git/index`));

      await t.sut.nextUnstaged();

      expect(t.notifier.notices).toEqual([
        "no remaining unstaged files, use `mindfulStage.nextStagedRepo` to navigate through repos ready to be committed.",
      ]);
    });

    test("a repo cloned afterwards is found by the next navigation", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.sut.nextUnstaged();
      await t.polyrepo.cloneRepo(Polyrepo.CERT_MANAGER, {
        "kustomization.yaml": "resources:\n  - cert-manager.yaml\n",
      });
      await t.polyrepo.modifyTrackedFile(Polyrepo.CERT_MANAGER_KUSTOMIZATION);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
        t.polyrepo.pathTo(Polyrepo.CERT_MANAGER_KUSTOMIZATION),
      ]);
    });
  });

  describe("the status bar summary", () => {
    test("with nothing changed anywhere says there are no changes", async ({
      t,
    }) => {
      expect(t.statusBar.summary).toBe("No changes");
    });

    test("with everything staged says it is ready to commit", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);

      expect(t.statusBar.summary).toBe("ready to commit");
    });

    test("counts repos holding unpushed commits", async ({ t }) => {
      await t.polyrepo.commitWithoutPushing(Polyrepo.ARGO, "argo.yaml");

      expect(t.statusBar.summary).toBe("1 unpushed");
    });

    test("counts repos with no upstream at all", async ({ t }) => {
      await t.polyrepo.removeUpstream(Polyrepo.ARGO);

      expect(t.statusBar.summary).toBe("1 unlinked");
    });

    test("shows unpushed alongside unstaged work", async ({ t }) => {
      await t.polyrepo.commitWithoutPushing(Polyrepo.ARGO, "argo.yaml");
      await t.polyrepo.modifyTrackedFile(last);

      expect(t.statusBar.summary).toBe("1M 1 unpushed");
    });

    test("counts unstaged work by its git status letter", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.modifyTrackedFile(last);
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "extra.yaml");

      expect(t.statusBar.summary).toBe("2M 1?");
    });

    test("counts deletions the navigation ring skips", async ({ t }) => {
      await t.polyrepo.deleteTrackedFile(first);

      expect(t.statusBar.summary).toBe("1D");
    });

    test("staging the only change makes it ready to commit", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      expect(t.statusBar.summary).toBe("1M");

      await t.polyrepo.stageFile(first);

      expect(t.statusBar.summary).toBe("ready to commit");
    });

    test("breaks the work down per repo on hover", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.commitWithoutPushing(
        Polyrepo.MINDFUL_STAGE,
        "README.md",
      );

      expect(t.statusBar.detail).toBe(
        [
          `- \`${Polyrepo.ARGO}\` 1M`,
          `- \`${Polyrepo.MINDFUL_STAGE}\` 1 unpushed commits`,
        ].join("\n"),
      );
    });

    test("hover says so when nothing is outstanding", async ({ t }) => {
      expect(t.statusBar.detail).toBe("No outstanding changes.");
    });

    test("reconciling agrees with the running total", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.deleteTrackedFile(last);
      const running = t.statusBar.summary;

      t.sut.reconcile();

      expect(t.statusBar.summary).toBe(running);
    });
  });

  describe("with a second folder added to the workspace", () => {
    test.override({
      roots: async ({ polyrepo, addedFolder }, use) => {
        await use([polyrepo.root, addedFolder.root]);
      },
    });

    test("a change in the added folder is navigable", async ({
      t,
      addedFolder,
    }) => {
      await addedFolder.modifyTrackedFile(first);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        addedFolder.pathTo(first),
      ]);
    });
  });
});
