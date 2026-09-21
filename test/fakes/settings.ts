import type { Settings } from "../../src/types";

export class FakeSettings implements Settings {
  private decorations = true;

  decorationsEnabled(): boolean {
    return this.decorations;
  }

  turnDecorationsOff(): void {
    this.decorations = false;
  }

  loggingEnabled(): boolean {
    return false;
  }

  colorTheme(): string {
    return "";
  }

  colorCustomizations(): Record<string, unknown> {
    return {};
  }
}
