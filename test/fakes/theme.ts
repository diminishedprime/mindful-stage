import { type Theme, type ThemeEntry, Variant } from "../../src/types";

export class FakeTheme implements Theme {
  variant(): Variant {
    return Variant.Dark;
  }

  installed(): ThemeEntry[] {
    return [];
  }
}
