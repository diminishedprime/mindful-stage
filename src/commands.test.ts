import "reflect-metadata";
import { container } from "tsyringe";
import { describe, expect, test as base } from "vitest";
import {
  Commands,
  EDITOR,
  GIT,
  GIT_REFRESHER,
  NOTIFIER,
  REPO_FINDER,
  ROOTS,
  WATCHER,
} from "./commands";
import { GlobRepoFinder } from "./repo-finder";
import { SimpleGitClient } from "./git";
import type {
  Editor,
  Git,
  GitRefresher,
  Notifier,
  RepoFinder,
  Watcher,
} from "./types";
import { FakeEditor } from "../test/fakes/editor";
import { GatedGit } from "../test/fakes/git";
import { FakeGitRefresher } from "../test/fakes/git-refresher";
import { FakeNotifier } from "../test/fakes/notifier";
import { GatedRepoFinder } from "../test/fakes/repo-finder";
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
  watcher: SettlingWatcher;
  sut: Commands;
  t: {
    polyrepo: Polyrepo;
    editor: FakeEditor;
    notifier: FakeNotifier;
    git: GatedGit;
    gitRefresher: FakeGitRefresher;
    finder: GatedRepoFinder;
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
  sut: async (
    { roots, editor, notifier, git, gitRefresher, finder, watcher },
    use,
  ) => {
    const sut = container
      .createChildContainer()
      .register<Editor>(EDITOR, { useValue: editor })
      .register<Notifier>(NOTIFIER, { useValue: notifier })
      .register<Git>(GIT, { useValue: git })
      .register<GitRefresher>(GIT_REFRESHER, { useValue: gitRefresher })
      .register<RepoFinder>(REPO_FINDER, { useValue: finder })
      .register<string[]>(ROOTS, { useValue: roots })
      .register<Watcher>(WATCHER, { useValue: watcher })
      .resolve(Commands);
    await sut.ready();
    await use(sut);
    await sut.dispose();
  },
  t: async (
    { polyrepo, editor, notifier, git, gitRefresher, finder, watcher, sut },
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

    test("skips deleted files", async ({ t }) => {
      await t.polyrepo.deleteTrackedFile(Polyrepo.ARGO_YAML);

      await t.sut[command]();

      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual(["no unstaged files"]);
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
      expect(t.gitRefresher.refreshes).toBe(1);
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
      expect(t.gitRefresher.refreshes).toBe(1);
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
