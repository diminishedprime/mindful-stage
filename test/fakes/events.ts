import type { Events } from "../../src/types";

export class FakeEvents implements Events {
  private visible: ((files: string[]) => void)[] = [];
  private colors: (() => void)[] = [];
  private toggles: (() => void)[] = [];

  visibleFilesChanged(handler: (files: string[]) => void): void {
    this.visible.push(handler);
  }

  colorsChanged(handler: () => void): void {
    this.colors.push(handler);
  }

  decorationsToggled(handler: () => void): void {
    this.toggles.push(handler);
  }

  showing(files: string[]): void {
    for (const handler of this.visible) {
      handler(files);
    }
  }

  recoloured(): void {
    for (const handler of this.colors) {
      handler();
    }
  }

  toggledDecorations(): void {
    for (const handler of this.toggles) {
      handler();
    }
  }

  async dispose(): Promise<void> {}
}
