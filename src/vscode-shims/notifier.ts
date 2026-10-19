import { ProgressLocation, window } from "vscode";
import type { Notifier } from "../types";

export class VscodeNotifier implements Notifier {
  notify(message: string): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: VscodeNotifier.prefixed(message),
      },
      () => new Promise((resolve) => setTimeout(resolve, 1500)),
    );
  }

  warn(message: string): void {
    window.showWarningMessage(VscodeNotifier.prefixed(message));
  }

  error(message: string): void {
    window.showErrorMessage(VscodeNotifier.prefixed(message));
  }

  private static prefixed(message: string): string {
    return `mindful-stage: ${message}`;
  }
}
