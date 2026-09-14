import { inject, injectable } from "tsyringe";
import { NAVIGATION, PICKER, TALLY } from "./di-tokens";
import { Navigation } from "./navigation";
import { Tally } from "./tally";
import type { Choice, Destination, Picker } from "./types";

@injectable()
export class RepoPicker {
  constructor(
    @inject(NAVIGATION) private readonly navigation: Navigation,
    @inject(PICKER) private readonly picker: Picker,
    @inject(TALLY) private readonly tally: Tally,
  ) {}

  async pick(): Promise<void> {
    const choices = this.tally.choices();
    if (choices.length === 0) {
      return;
    }
    return this.navigation.navigate({ plan: () => this.choose(choices) });
  }

  private async choose(choices: Choice[]): Promise<Destination | undefined> {
    const chosen = await this.picker.pick(choices);
    if (chosen === undefined) {
      return undefined;
    }
    return Navigation.toRepo(chosen.repo);
  }
}
