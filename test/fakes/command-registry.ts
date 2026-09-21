import type { CommandRegistry } from "../../src/types";

export class FakeCommandRegistry implements CommandRegistry {
  readonly registered = new Map<string, () => Promise<void>>();

  register(name: string, run: () => Promise<void>): void {
    this.registered.set(name, run);
  }

  async dispose(): Promise<void> {
    this.registered.clear();
  }
}
