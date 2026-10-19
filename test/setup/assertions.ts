import { expect } from "vitest";
import type {
  Band,
  ExplorerView,
  GutterLine,
  EditorView,
  FilesView,
  GitView,
  GutterView,
  MessagesView,
  PickerView,
  StatusBarView,
} from "./views";

interface SurfaceMatchers<R = unknown> {
  toBeAt(file: string, line: number): R;
  toHaveShown(text: string): R;
  toNeverLookInside(folder: string): R;
  toRead(text: string): R;
  toMarkNothing(): R;
  toMark(file: string, badge: string): R;
  toColourBadge(file: string, colour: string): R;
  toMarkNothingOn(file: string): R;
  toMarkStaged(file: string, from: number, to: number): R;
  toMarkUnstaged(file: string, from: number, to: number): R;
  toHaveNoBand(): R;
  toHaveNoWedges(): R;
  toBeSolid(): R;
  toBeHatched(): R;
  toBeColoured(colour: string): R;
  toHaveWedgeOnTop(): R;
  toHaveWedgeAtTheBottom(): R;
  toHaveWedgeColoured(colour: string): R;
  toInclude(message: string): R;
  toShow(message: string, times: number): R;
  toShowNothing(): R;
  toHaveRefreshedStatus(times: number): R;
  toOffer(repo: string, detail: string): R;
  toStayClosed(): R;
}

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
  > extends SurfaceMatchers<R> {}
}

function compare(
  this: { equals(a: unknown, b: unknown): boolean },
  actual: unknown,
  expected: unknown,
  what: string,
) {
  return {
    pass: this.equals(actual, expected),
    message: () => `expected ${what}`,
    actual,
    expected,
  };
}

function marksAround(
  this: { equals(a: unknown, b: unknown): boolean },
  gutter: GutterView,
  file: string,
  band: Band,
  from: number,
  to: number,
) {
  return compare.call(
    this,
    gutter
      .lines(file, band)
      .filter((line) => line >= from - 1 && line <= to + 1),
    Array.from({ length: to - from + 1 }, (_, i) => from + i),
    `the gutter to mark ${file} lines ${from}-${to} as ${band}`,
  );
}

function includes(actual: string[], expected: string, what: string) {
  return {
    pass: actual.includes(expected),
    message: () => `expected ${what}`,
    actual,
    expected: [expected],
  };
}

expect.extend({
  toBeAt(editor: EditorView, file: string, line: number) {
    return compare.call(
      this,
      { file: editor.openFile(), line: editor.openLine() },
      { file, line },
      `the cursor to be at ${file}:${line}`,
    );
  },

  toNeverLookInside(files: FilesView, folder: string) {
    return compare.call(
      this,
      files.lookedInside(folder),
      false,
      `nothing inside ${folder} to be listed`,
    );
  },

  toHaveShown(statusBar: StatusBarView, text: string) {
    return includes(
      statusBar.history(),
      text,
      `the status bar to have shown "${text}"`,
    );
  },

  toRead(statusBar: StatusBarView, text: string) {
    return compare.call(
      this,
      statusBar.text(),
      text,
      `the status bar to read ${text}`,
    );
  },

  toMarkNothing(explorer: ExplorerView) {
    return compare.call(
      this,
      explorer.files(),
      [],
      "the explorer to mark no files",
    );
  },

  toMark(explorer: ExplorerView, file: string, badge: string) {
    return compare.call(
      this,
      explorer.on(file),
      badge,
      `the explorer to mark ${file} with ${badge}`,
    );
  },

  toColourBadge(explorer: ExplorerView, file: string, colour: string) {
    return compare.call(
      this,
      explorer.colourOf(file),
      colour,
      `the explorer to colour ${file}'s badge as ${colour}`,
    );
  },

  toMarkNothingOn(explorer: ExplorerView, file: string) {
    return compare.call(
      this,
      explorer.on(file),
      "",
      `the explorer to mark nothing on ${file}`,
    );
  },

  toMarkStaged(gutter: GutterView, file: string, from: number, to: number) {
    return marksAround.call(this, gutter, file, "solid", from, to);
  },

  toMarkUnstaged(gutter: GutterView, file: string, from: number, to: number) {
    return marksAround.call(this, gutter, file, "hatched", from, to);
  },

  toHaveNoBand(line: GutterLine) {
    return compare.call(this, line.band, undefined, "no band");
  },

  toHaveNoWedges(line: GutterLine) {
    return compare.call(this, line.wedges, {}, "no wedges");
  },

  toBeSolid(line: GutterLine) {
    return compare.call(this, line.band, "solid", "a solid band");
  },

  toBeHatched(line: GutterLine) {
    return compare.call(this, line.band, "hatched", "a hatched band");
  },

  toBeColoured(line: GutterLine, colour: string) {
    return compare.call(this, line.colour, colour, `a ${colour} band`);
  },

  toHaveWedgeOnTop(line: GutterLine) {
    return compare.call(
      this,
      line.wedges.top !== undefined,
      true,
      "a wedge on top",
    );
  },

  toHaveWedgeAtTheBottom(line: GutterLine) {
    return compare.call(
      this,
      line.wedges.bottom !== undefined,
      true,
      "a wedge at the bottom",
    );
  },

  toHaveWedgeColoured(line: GutterLine, colour: string) {
    return includes(Object.values(line.wedges), colour, `a ${colour} wedge`);
  },

  toInclude(messages: MessagesView, message: string) {
    return includes(messages.shown(), message, `"${message}" to be shown`);
  },

  toShow(messages: MessagesView, message: string, times: number) {
    return compare.call(
      this,
      messages.shown().filter((shown) => shown === message).length,
      times,
      `"${message}" to be shown ${times} times`,
    );
  },

  toShowNothing(messages: MessagesView) {
    return compare.call(this, messages.shown(), [], "no messages");
  },

  toHaveRefreshedStatus(git: GitView, times: number) {
    return compare.call(
      this,
      git.statusRefreshes(),
      times,
      `git status to have refreshed ${times} times`,
    );
  },

  toStayClosed(picker: PickerView) {
    return compare.call(
      this,
      picker.wasShown(),
      false,
      "the picker to stay closed",
    );
  },

  toOffer(picker: PickerView, repo: string, work: string) {
    return includes(
      picker.offers(),
      `${repo} ${work}`,
      `the picker to offer ${repo} with ${work}, shown once`,
    );
  },
});
