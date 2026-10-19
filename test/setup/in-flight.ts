export class InFlight {
  private count = 0;
  private drained: Promise<void> = Promise.resolve();
  private drain: () => void = () => undefined;

  track(work: Promise<unknown>): void {
    if (this.count === 0) {
      this.drained = new Promise((resolve) => {
        this.drain = resolve;
      });
    }
    this.count += 1;
    void this.finish(work);
  }

  private async finish(work: Promise<unknown>): Promise<void> {
    await Promise.allSettled([work]);
    this.count -= 1;
    if (this.count === 0) {
      this.drain();
    }
  }

  settled(): Promise<void> {
    return this.drained;
  }
}
