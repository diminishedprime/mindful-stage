import * as vscode from "vscode";
import type { Notifier } from "../types";

export class VscodeNotifier implements Notifier {
  notify(message: string): void {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: VscodeNotifier.prefixed(message),
      },
      () => new Promise((resolve) => setTimeout(resolve, 1500)),
    );
  }

  error(message: string): void {
    vscode.window.showErrorMessage(VscodeNotifier.prefixed(message));
  }

  private static prefixed(message: string): string {
    return `mindful-stage: ${message}`;
  }
}
