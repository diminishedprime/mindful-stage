import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import "reflect-metadata";
import { container } from "tsyringe";
import { describe, expect, test as base } from "vitest";
import { Commands } from "./commands";
import {
  COMMAND_REGISTRY,
  COMPOSITOR,
  DECORATIONS,
  EDITOR,
  EVENTS,
  FILE_BADGES,
  FILE_DECORATIONS,
  GUTTERS,
  LOG_DIRECTORY,
  LOGGER,
  GIT,
  MANIFEST,
  NAVIGATION,
  NOTIFIER,
  PACKAGE_JSON,
  PALETTE,
  PICKER,
  REPO_FINDER,
  REPO_PICKER,
  REPOS,
  WORKSPACE_FOLDERS,
  STAGING,
  SETTINGS,
  STATUS_BAR,
  TALLY,
  THEME,
  WATCHER,
  WORKSPACE,
  WORKSPACE_FILE_WATCHER,
} from "./di-tokens";
import { Compositor } from "./display/compositor";
import { FileBadges } from "./display/file-badges";
import { Gutters } from "./display/gutters";
import { Logger } from "./logger";
import { Navigation } from "./navigation";
import { Palette } from "./palette";
import { Manifest } from "./palette/manifest";
import { GlobRepoFinder } from "./repo-finder";
import { RepoPicker } from "./repo-picker";
import { Repos } from "./repos";
import { GitStager as GitStager } from "./staging";
import { Tally } from "./tally";
import { Workspace } from "./workspace";
import { WorkspaceFileWatcher } from "./workspace-file-watcher";
import { SimpleGitClient } from "./git";
import { Change } from "./types";
import type {
  CommandRegistry,
  Decorations,
  Editor,
  Events,
  FileDecorations,
  Settings,
  Git,
  Notifier,
  Picker,
  RepoFinder,
  StatusBar,
  Theme,
  Watcher,
} from "./types";
import { FakeCommandRegistry } from "../test/fakes/command-registry";
import { FakeDecorations } from "../test/fakes/decorations";
import { FakeEvents } from "../test/fakes/events";
import { FakeFileDecorations } from "../test/fakes/file-decorations";
import { FakeSettings } from "../test/fakes/settings";
import { FakeTheme } from "../test/fakes/theme";
import { FakeEditor } from "../test/fakes/editor";
import { GatedGit } from "../test/fakes/git";
import { FakeNotifier } from "../test/fakes/notifier";
import { FakePicker } from "../test/fakes/picker";
import { GatedRepoFinder } from "../test/fakes/repo-finder";
import { FakeStatusBar } from "../test/fakes/status-bar";
import { SettlingWatcher } from "../test/fakes/watcher";
import { ParcelWatcher } from "../test/parcel-watcher";
import { Polyrepo } from "../test/polyrepo";

const packageJson: unknown = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

const first = Polyrepo.ARGO_YAML;
const middle = Polyrepo.ARGO_KUSTOMIZATION;
const last = Polyrepo.MINDFUL_STAGE_README;

const test = base.extend<{
  polyrepo: Polyrepo;
  addedFolder: Polyrepo;
  workspaceFolders: string[];
  editor: FakeEditor;
  notifier: FakeNotifier;
  git: GatedGit;
  finder: GatedRepoFinder;
  picker: FakePicker;
  statusBar: FakeStatusBar;
  settings: FakeSettings;
  events: FakeEvents;
  badges: FakeFileDecorations;
  gutter: FakeDecorations;
  tally: { current: Tally | undefined };
  watcher: SettlingWatcher;
  sut: Commands;
  t: {
    polyrepo: Polyrepo;
    editor: FakeEditor;
    notifier: FakeNotifier;
    git: GatedGit;
    finder: GatedRepoFinder;
    picker: FakePicker;
    statusBar: FakeStatusBar;
    settings: FakeSettings;
    events: FakeEvents;
    badges: FakeFileDecorations;
    gutter: FakeDecorations;
    tally: { current: Tally | undefined };
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
  workspaceFolders: async ({ polyrepo }, use) => {
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
  settings: async ({}, use) => {
    await use(new FakeSettings());
  },
  events: async ({}, use) => {
    await use(new FakeEvents());
  },
  badges: async ({}, use) => {
    await use(new FakeFileDecorations());
  },
  gutter: async ({}, use) => {
    await use(new FakeDecorations());
  },
  tally: async ({}, use) => {
    await use({ current: undefined as Tally | undefined });
  },
  sut: async (
    {
      workspaceFolders,
      editor,
      notifier,
      git,
      finder,
      picker,
      statusBar,
      settings,
      events,
      badges,
      gutter,
      tally,
      watcher,
    },
    use,
  ) => {
    const child = container
      .createChildContainer()
      .register<CommandRegistry>(COMMAND_REGISTRY, {
        useValue: new FakeCommandRegistry(),
      })
      .register<Editor>(EDITOR, { useValue: editor })
      .register<Settings>(SETTINGS, { useValue: settings })
      .register<string>(LOG_DIRECTORY, {
        useValue: path.join(os.tmpdir(), "mindful-stage-test-logs"),
      })
      .registerSingleton(LOGGER, Logger)
      .register<Notifier>(NOTIFIER, { useValue: notifier })
      .register<Git>(GIT, { useValue: git })
      .register<Picker>(PICKER, { useValue: picker })
      .register<RepoFinder>(REPO_FINDER, { useValue: finder })
      .register<StatusBar>(STATUS_BAR, { useValue: statusBar })
      .register<string[]>(WORKSPACE_FOLDERS, { useValue: workspaceFolders })
      .register<Watcher>(WATCHER, { useValue: watcher })
      .register<Events>(EVENTS, { useValue: events })
      .register<Theme>(THEME, { useValue: new FakeTheme() })
      .register<unknown>(PACKAGE_JSON, { useValue: packageJson })
      .register<Decorations>(DECORATIONS, { useValue: gutter })
      .register<FileDecorations>(FILE_DECORATIONS, { useValue: badges })
      .registerSingleton(MANIFEST, Manifest)
      .registerSingleton(PALETTE, Palette)
      .registerSingleton(COMPOSITOR, Compositor)
      .registerSingleton(WORKSPACE_FILE_WATCHER, WorkspaceFileWatcher)
      .registerSingleton(REPOS, Repos)
      .registerSingleton(WORKSPACE, Workspace)
      .registerSingleton(NAVIGATION, Navigation)
      .registerSingleton(TALLY, Tally)
      .registerSingleton(REPO_PICKER, RepoPicker)
      .registerSingleton(STAGING, GitStager)
      .registerSingleton(FILE_BADGES, FileBadges)
      .registerSingleton(GUTTERS, Gutters);
    const sut = child.resolve(Commands);
    tally.current = child.resolve<Tally>(TALLY);
    child.resolve<Repos>(REPOS).subscribe(tally.current);
    child.resolve<FileBadges>(FILE_BADGES);
    child.resolve<Gutters>(GUTTERS);
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
      finder,
      picker,
      statusBar,
      settings,
      events,
      badges,
      gutter,
      tally,
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
      finder,
      picker,
      statusBar,
      settings,
      events,
      badges,
      gutter,
      tally,
      watcher,
      sut,
    });
  },
});

describe.concurrent("Mindful Stage", () => {
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
    }, 7000);

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
    }, 7000);

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

  describe("navigating from a file that is not a stop", () => {
    test("moves to the first unstaged hunk from a file in no repo", async ({
      t,
    }) => {
      const scratch = t.polyrepo.pathTo(".claude/scratch/issue-181.md");
      await t.polyrepo.modifyTrackedLine(first, 2);
      await t.editor.open(scratch, 8);

      await t.sut.nextUnstagedHunk();

      expect(t.editor.opened).toEqual([
        { path: scratch, line: 8 },
        { path: t.polyrepo.pathTo(first), line: 2 },
      ]);
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

  describe.each(Navigation.COMMON_README_FILENAMES)(
    "a repo whose readme is named %s",
    (readme) => {
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
    },
  );

  describe("pressing a navigation twice before it lands", () => {
    test("only the last press opens an editor", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.modifyTrackedFile(last);

      await Promise.all([t.sut.nextUnstaged(), t.sut.nextUnstaged()]);

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(first),
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

    test("with nothing outstanding never shows a picker", async ({ t }) => {
      await t.sut.pickRepo();

      expect(t.picker.offered).toEqual([]);
      expect(t.editor.opened).toEqual([]);
      expect(t.notifier.notices).toEqual([]);
    });
  });

  describe("with a file outside every repo in the editor", () => {
    test("staging a hunk says so and stages nothing", async ({ t }) => {
      await t.editor.open(t.polyrepo.pathTo("notes.txt"));

      await t.sut.stageHunkAtCursor();

      expect(t.notifier.notices).toEqual(["not inside a repo"]);
    });

    test("starting to track says so and touches nothing", async ({ t }) => {
      await t.editor.open(t.polyrepo.pathTo("notes.txt"));

      await t.sut.startTracking();

      expect(t.notifier.notices).toEqual(["not inside a repo"]);
    });
  });

  describe("a file that left disk since the last refresh", () => {
    test("stands in with the readme instead of failing to open", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);
      t.git.holdAll();
      t.polyrepo.deleteTrackedFileWithoutSettling(first);

      await t.sut.nextUnstaged();

      expect(t.editor.opened.map((p) => p.path)).toEqual([
        t.polyrepo.pathTo(`${Polyrepo.ARGO}/.gitignore`),
      ]);
      expect(t.notifier.errors).toEqual([
        "argo.yaml was deleted, opening first tracked file so you can stage the deletion manually.",
      ]);
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
      expect(t.statusBar.summary).toBe("$(mindful-stage-clean) No changes");
    });

    test("with everything staged says it is ready to commit", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);

      expect(t.statusBar.summary).toBe(
        "$(mindful-stage-ready) ready to commit",
      );
    });

    test("counts repos holding unpushed commits", async ({ t }) => {
      await t.polyrepo.commitWithoutPushing(Polyrepo.ARGO, "argo.yaml");

      expect(t.statusBar.summary).toBe("$(mindful-stage-unpushed)1");
    });

    test("counts repos with no upstream at all", async ({ t }) => {
      await t.polyrepo.removeUpstream(Polyrepo.ARGO);

      expect(t.statusBar.summary).toBe("$(mindful-stage-missing-upstream)1");
    });

    test("shows unpushed alongside unstaged work", async ({ t }) => {
      await t.polyrepo.commitWithoutPushing(Polyrepo.ARGO, "argo.yaml");
      await t.polyrepo.modifyTrackedFile(last);

      expect(t.statusBar.summary).toBe("1M $(mindful-stage-unpushed)1");
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

      expect(t.statusBar.summary).toBe(
        "$(mindful-stage-ready) ready to commit",
      );
    });

    test("a repo that disappears stops counting", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      expect(t.statusBar.summary).toBe("1M");

      await t.polyrepo.removeRepo(Polyrepo.ARGO);

      expect(t.statusBar.summary).toBe("$(mindful-stage-clean) No changes");
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

      t.tally.current!.reconcile();

      expect(t.statusBar.summary).toBe(running);
    });
  });

  describe("with a second folder added to the workspace", () => {
    test.override({
      workspaceFolders: async ({ polyrepo, addedFolder }, use) => {
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

  describe("the explorer badges", () => {
    test("with nothing changed anywhere, nothing is badged", async ({ t }) => {
      expect(t.badges.badged).toEqual([]);
    });

    test("an edited file is badged as modified", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);

      expect(t.badges.badgeOn(t.polyrepo.pathTo(first))).toBe("M");
    });

    test("a staged file is badged as staged", async ({ t }) => {
      await t.polyrepo.stageTrackedChange(first);

      expect(t.badges.badgeOn(t.polyrepo.pathTo(first))).toBe("S");
    });

    test("an untracked file is badged as added", async ({ t }) => {
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "extra.yaml");

      expect(
        t.badges.badgeOn(t.polyrepo.pathTo(`${Polyrepo.ARGO}/extra.yaml`)),
      ).toBe("A");
    });

    test("editing a staged file again shows the unstaged badge", async ({
      t,
    }) => {
      await t.polyrepo.stageTrackedChange(first);
      await t.polyrepo.modifyTrackedFile(first);

      expect(t.badges.badgeOn(t.polyrepo.pathTo(first))).toBe("M");
    });

    test("files in every repo carry their own badge", async ({ t }) => {
      await t.polyrepo.modifyTrackedFile(first);
      await t.polyrepo.stageTrackedChange(last);

      expect(t.badges.badgeOn(t.polyrepo.pathTo(first))).toBe("M");
      expect(t.badges.badgeOn(t.polyrepo.pathTo(last))).toBe("S");
    });

    test("a repo leaving the workspace takes its badges with it", async ({
      t,
    }) => {
      await t.polyrepo.modifyTrackedFile(first);

      await t.polyrepo.removeRepo(Polyrepo.ARGO);

      expect(t.badges.badged).toEqual([]);
    });
  });

  describe("the gutter marks", () => {
    test("mark the edited line of the file on screen", async ({
      t,
      expect,
    }) => {
      const file = t.polyrepo.pathTo(last);
      const edited = 4;
      await t.polyrepo.modifyTrackedLine(last, edited);

      await t.editor.open(file);
      t.events.showing([file]);

      await expect
        .poll(() => t.gutter.linesMarked(file, Change.Unstaged))
        .toEqual([edited - 1]);
    });

    test("show a staged line as staged", async ({ t, expect }) => {
      const file = t.polyrepo.pathTo(last);
      const edited = 4;
      await t.polyrepo.stageTrackedLine(last, edited);

      await t.editor.open(file);
      t.events.showing([file]);

      await expect
        .poll(() => t.gutter.linesMarked(file, Change.Staged))
        .toEqual([edited - 1]);
      expect(t.gutter.linesMarked(file, Change.Unstaged)).toEqual([]);
    });

    test("cover every line of an untracked file", async ({ t, expect }) => {
      await t.polyrepo.createUntrackedFile(Polyrepo.ARGO, "extra.yaml", 3);
      const file = t.polyrepo.pathTo(`${Polyrepo.ARGO}/extra.yaml`);

      await t.editor.open(file);
      t.events.showing([file]);

      const everyLine = [...Array(t.editor.numberOfLines(file)).keys()];
      await expect
        .poll(() => t.gutter.linesMarked(file, Change.Untracked))
        .toEqual(everyLine);
    });

    test("clear when decorations are turned off", async ({ t, expect }) => {
      const file = t.polyrepo.pathTo(last);
      await t.polyrepo.modifyTrackedLine(last, 4);
      await t.editor.open(file);
      t.events.showing([file]);
      await expect.poll(() => t.gutter.anythingMarked(file)).toBe(true);

      t.settings.turnDecorationsOff();
      t.events.toggledDecorations();

      await expect.poll(() => t.gutter.anythingMarked(file)).toBe(false);
    });
  });
});
