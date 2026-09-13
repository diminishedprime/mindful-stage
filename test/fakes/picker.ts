import type { Choice, Picker } from "../../src/types";

export class FakePicker implements Picker {
  offered: Choice[][] = [];
  private choose: ((choices: Choice[]) => Choice | undefined) | undefined;

  get choices(): Choice[] {
    return this.offered.at(-1) ?? [];
  }

  picks(repo: string): void {
    this.choose = (choices) => choices.find((c) => c.repo?.endsWith(repo));
  }

  picksFirst(): void {
    this.choose = (choices) => choices[0];
  }

  async pick(choices: Choice[]): Promise<Choice | undefined> {
    this.offered.push(choices);
    return this.choose?.(choices);
  }
}
