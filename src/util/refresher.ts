export type Completed<Value> = (value: Value) => void;

// Keeps a value fresh by re-running an expensive computation, with the
// guarantee that at most one run is ever in flight and that anyone who asks
// for a rerun mid-flight waits for a run that started after they asked.
//
// The contract:
//
// - `value()` hands back the latest result, starting the first run if nothing
//   is known yet. `fresh()` prefers a run in flight over the cached value.
// - `rerun()` while idle just runs. `rerun()` while a run is in flight queues
//   exactly one follow-up, started only once the current run completes, and
//   resolves every mid-flight caller when that follow-up settles. Thirty
//   callers during one run cost one extra run, not thirty.
// - A run that fails still honours the queue, so a transient error can't
//   strand a pending request.
// - `completed(value)` fires after every completed run.
//
// A repo's git status is the motivating case. Status is a full read of the
// working tree, so a change that lands while one is running is missed by it
// and needs a run that starts afterwards - but never more than one:
//
//     const status = new Refresher(
//       () => this.statusOf(),
//       (changes) => this.refreshed(changes),
//     );
//     status.value();   // navigation: latest Changes, fetched on first use
//     status.rerun();   // watcher: a file changed, refresh once we can
export class Refresher<Value> {
  private latest: Value | undefined;
  private running: Promise<Value> | undefined;
  private waiting: Array<() => void> | undefined;

  constructor(
    private readonly compute: () => Promise<Value>,
    private readonly completed: Completed<Value>,
  ) {}

  get current(): Value | undefined {
    return this.latest;
  }

  get inFlight(): Promise<unknown> {
    return Promise.allSettled([this.running]);
  }

  ensureStarted(): void {
    if (this.latest === undefined && this.running === undefined) {
      this.run();
    }
  }

  async value(): Promise<Value> {
    this.ensureStarted();
    return this.latest ?? (await this.running!);
  }

  async fresh(): Promise<Value> {
    this.ensureStarted();
    return (await this.running) ?? this.latest!;
  }

  rerun(): Promise<void> {
    if (this.running === undefined) {
      return Refresher.settled(this.run());
    }
    this.waiting ??= [];
    return new Promise((resolve) => this.waiting!.push(resolve));
  }

  private run(): Promise<Value> {
    this.running ??= this.compute().then(
      (value) => {
        this.latest = value;
        this.running = undefined;
        this.completed(value);
        this.drain();
        return value;
      },
      (error) => {
        this.running = undefined;
        this.drain();
        throw error;
      },
    );
    return this.running;
  }

  private drain(): void {
    const waiting = this.waiting;
    if (waiting === undefined) {
      return;
    }
    this.waiting = undefined;
    void Refresher.settled(this.run()).then(() => {
      for (const resolve of waiting) {
        resolve();
      }
    });
  }

  private static async settled(run: Promise<unknown>): Promise<void> {
    await Promise.allSettled([run]);
  }
}
