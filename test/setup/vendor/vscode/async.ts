/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IDisposable, MutableDisposable, type Timeout } from './stand-ins';

export class RunOnceScheduler<Runner extends (...args: any[]) => any = () => any> implements IDisposable {

	protected runner: Runner | null;

	private timeoutToken: Timeout | undefined;
	private timeout: number;
	private timeoutHandler: () => void;

	constructor(runner: Runner, delay: number) {
		this.timeoutToken = undefined;
		this.runner = runner;
		this.timeout = delay;
		this.timeoutHandler = this.onTimeout.bind(this);
	}

	/**
	 * Dispose RunOnceScheduler
	 */
	dispose(): void {
		this.cancel();
		this.runner = null;
	}

	/**
	 * Cancel current scheduled runner (if any).
	 */
	cancel(): void {
		if (this.isScheduled()) {
			clearTimeout(this.timeoutToken);
			this.timeoutToken = undefined;
		}
	}

	/**
	 * Cancel previous runner (if any) & schedule a new runner.
	 */
	schedule(delay = this.timeout): void {
		this.cancel();
		this.timeoutToken = setTimeout(this.timeoutHandler, delay);
	}

	get delay(): number {
		return this.timeout;
	}

	set delay(value: number) {
		this.timeout = value;
	}

	/**
	 * Returns true if scheduled.
	 */
	isScheduled(): boolean {
		return this.timeoutToken !== undefined;
	}

	flush(): void {
		if (this.isScheduled()) {
			this.cancel();
			this.doRun();
		}
	}

	private onTimeout() {
		this.timeoutToken = undefined;
		if (this.runner) {
			this.doRun();
		}
	}

	protected doRun(): void {
		this.runner?.();
	}
}

export class RunOnceWorker<T> extends RunOnceScheduler<(units: T[]) => void> {

	private units: T[] = [];

	constructor(runner: (units: T[]) => void, timeout: number) {
		super(runner, timeout);
	}

	work(unit: T): void {
		this.units.push(unit);

		if (!this.isScheduled()) {
			this.schedule();
		}
	}

	protected override doRun(): void {
		const units = this.units;
		this.units = [];

		this.runner?.(units);
	}

	override dispose(): void {
		this.units = [];

		super.dispose();
	}
}

export interface IThrottledWorkerOptions {

	/**
	 * maximum of units the worker will pass onto handler at once
	 */
	maxWorkChunkSize: number;

	/**
	 * maximum of units the worker will keep in memory for processing
	 */
	maxBufferedWork: number | undefined;

	/**
	 * delay before processing the next round of chunks when chunk size exceeds limits
	 */
	throttleDelay: number;

	/**
	 * When enabled will guarantee that two distinct calls to `work()` are not executed
	 * without throttle delay between them.
	 * Otherwise if the worker isn't currently throttling it will execute work immediately.
	 */
	waitThrottleDelayBetweenWorkUnits?: boolean;
}

/**
 * The `ThrottledWorker` will accept units of work `T`
 * to handle. The contract is:
 * * there is a maximum of units the worker can handle at once (via `maxWorkChunkSize`)
 * * there is a maximum of units the worker will keep in memory for processing (via `maxBufferedWork`)
 * * after having handled `maxWorkChunkSize` units, the worker needs to rest (via `throttleDelay`)
 */
export class ThrottledWorker<T> extends Disposable {

	private readonly pendingWork: T[] = [];

	private readonly throttler = this._register(new MutableDisposable<RunOnceScheduler>());
	private disposed = false;
	private lastExecutionTime = 0;

	constructor(
		private options: IThrottledWorkerOptions,
		private readonly handler: (units: T[]) => void
	) {
		super();
	}

	/**
	 * The number of work units that are pending to be processed.
	 */
	get pending(): number { return this.pendingWork.length; }

	/**
	 * Add units to be worked on. Use `pending` to figure out
	 * how many units are not yet processed after this method
	 * was called.
	 *
	 * @returns whether the work was accepted or not. If the
	 * worker is disposed, it will not accept any more work.
	 * If the number of pending units would become larger
	 * than `maxPendingWork`, more work will also not be accepted.
	 */
	work(units: readonly T[]): boolean {
		if (this.disposed) {
			return false; // work not accepted: disposed
		}

		// Check for reaching maximum of pending work
		if (typeof this.options.maxBufferedWork === 'number') {

			// Throttled: simple check if pending + units exceeds max pending
			if (this.throttler.value) {
				if (this.pending + units.length > this.options.maxBufferedWork) {
					return false; // work not accepted: too much pending work
				}
			}

			// Unthrottled: same as throttled, but account for max chunk getting
			// worked on directly without being pending
			else {
				if (this.pending + units.length - this.options.maxWorkChunkSize > this.options.maxBufferedWork) {
					return false; // work not accepted: too much pending work
				}
			}
		}

		// Add to pending units first
		for (const unit of units) {
			this.pendingWork.push(unit);
		}

		const timeSinceLastExecution = Date.now() - this.lastExecutionTime;

		if (!this.throttler.value && (!this.options.waitThrottleDelayBetweenWorkUnits || timeSinceLastExecution >= this.options.throttleDelay)) {
			// Work directly if we are not throttling and we are not
			// enforced to throttle between `work()` calls.
			this.doWork();
		} else if (!this.throttler.value && this.options.waitThrottleDelayBetweenWorkUnits) {
			// Otherwise, schedule the throttler to work.
			this.scheduleThrottler(Math.max(this.options.throttleDelay - timeSinceLastExecution, 0));
		} else {
			// Otherwise, our work will be picked up by the running throttler
		}

		return true; // work accepted
	}

	private doWork(): void {
		this.lastExecutionTime = Date.now();

		// Extract chunk to handle and handle it
		this.handler(this.pendingWork.splice(0, this.options.maxWorkChunkSize));

		// If we have remaining work, schedule it after a delay
		if (this.pendingWork.length > 0) {
			this.scheduleThrottler();
		}
	}

	private scheduleThrottler(delay = this.options.throttleDelay): void {
		this.throttler.value = new RunOnceScheduler(() => {
			this.throttler.clear();

			this.doWork();
		}, delay);
		this.throttler.value.schedule();
	}

	override dispose(): void {
		super.dispose();

		this.pendingWork.length = 0;
		this.disposed = true;
	}
}
