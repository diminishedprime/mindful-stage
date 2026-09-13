import * as vscode from "vscode";
import type { Choice, Picker } from "../types";

export class VscodePicker implements Picker {
  async pick(choices: Choice[]): Promise<Choice | undefined> {
    return vscode.window.showQuickPick(
      choices.map((choice) => ({ ...choice, description: choice.detail })),
      { placeHolder: "Repos with outstanding work" },
    );
  }
}
