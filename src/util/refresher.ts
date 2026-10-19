export type Completed<Value> = (value: Value) => Promise<void>;

export type Failed = (error: unknown) => Promise<void>;

// Keeps a value fresh by re-running an expensive computation, with the
// guarantee that at most one run is ever in flight.
//
// The contract:
//
// - `start()` begins the first run. `value()` hands back the latest result,
//   waiting for that first run if nothing is known yet. `fresh()` prefers a
//   run in flight over the cached value.
// - `rerun()` while idle just runs. `rerun()` while a run is in flight queues
//   exactly one follow-up, started once the current run settles. Thirty
//   reruns during one run cost one extra run, not thirty.
// - `completed(value)` fires after every completed run, and `failed(error)`
//   after every failed one. A failed run still starts the queued follow-up.
//
// A repo's git status is the motivating case. Status is a full read of the
// working tree, so a change that lands while one is running is missed by it
// and needs a run that starts afterwards - but never more than one:
//
//     const status = new Refresher(
//       () => this.statusOf(),
//       (changes) => this.refreshed(changes),
//       (error) => this.warn(error),
//     );
//     status.start();   // as soon as the repo is known
//     status.value();   // navigation: latest Changes
//     status.rerun();   // watcher: a file changed, refresh once we can
export class Refresher<Value> {
  private latest: Value | undefined;
  private running: Promise<Value> | undefined;
  private queued = false;
  private settled: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly compute: () => Promise<Value>,
    private readonly completed: Completed<Value>,
    private readonly failed: Failed,
  ) {}

  get inFlight(): Promise<unknown> {
    return this.settled;
  }

  start(): void {
    this.run();
  }

  async value(): Promise<Value> {
    return this.latest ?? (await this.running!);
  }

  async fresh(): Promise<Value> {
    return (await this.running) ?? this.latest!;
  }

  rerun(): void {
    if (this.running === undefined) {
      this.run();
      return;
    }
    this.queued = true;
  }

  private run(): void {
    const running = this.compute();
    this.running = running;
    this.settled = Promise.allSettled([this.settled, this.settle(running)]);
  }

  private async settle(running: Promise<Value>): Promise<void> {
    const [result] = await Promise.allSettled([running]);
    this.running = undefined;
    this.startQueued();
    if (result.status === "rejected") {
      await this.failed(result.reason);
      return;
    }
    this.latest = result.value;
    await this.completed(result.value);
  }

  private startQueued(): void {
    if (!this.queued) {
      return;
    }
    this.queued = false;
    this.run();
  }
}
