import { window } from "vscode";
import type { Choice, Picker } from "../types";

export class VscodePicker implements Picker {
  async pick(choices: Choice[]): Promise<Choice | undefined> {
    return window.showQuickPick(choices, {
      placeHolder: "Repos with outstanding work",
    });
  }
}
