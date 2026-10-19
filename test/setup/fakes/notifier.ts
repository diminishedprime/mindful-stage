import type { Notifier } from "../../../src/types";

export class FakeNotifier implements Notifier {
  notices: string[] = [];
  warnings: string[] = [];
  errors: string[] = [];

  notify(message: string): void {
    this.notices.push(message);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}
