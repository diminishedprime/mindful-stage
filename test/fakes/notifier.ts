import type { Notifier } from "../../src/types";

export class FakeNotifier implements Notifier {
  notices: string[] = [];
  errors: string[] = [];

  notify(message: string): void {
    this.notices.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}
