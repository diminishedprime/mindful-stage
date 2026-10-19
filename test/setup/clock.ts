import { vi } from "vitest";

export interface Clock {
  until<T>(work: Promise<T>): Promise<T>;
  stop(): void;
}

export class RealClock implements Clock {
  until<T>(work: Promise<T>): Promise<T> {
    return work;
  }

  stop(): void {}
}

export class VirtualClock implements Clock {
  private static readonly MAX_TURNS = 2_000;

  constructor() {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
  }

  async until<T>(work: Promise<T>): Promise<T> {
    let settled = false;
    const tracked = work.finally(() => {
      settled = true;
    });
    tracked.catch(() => undefined);
    for (let turn = 0; !settled; turn += 1) {
      if (turn > VirtualClock.MAX_TURNS) {
        throw new Error(
          `work never settled within ${VirtualClock.MAX_TURNS} turns`,
        );
      }
      await new Promise((resolve) => setImmediate(resolve));
      if (!settled && vi.getTimerCount() > 0) {
        await vi.advanceTimersToNextTimerAsync();
      }
    }
    return tracked;
  }

  stop(): void {
    vi.useRealTimers();
  }
}

export function clocked<Target extends object>(
  target: Target,
  clock: Clock,
): Target {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        const result: unknown = (
          value as (...args: unknown[]) => unknown
        ).apply(object, args);
        return result instanceof Promise ? clock.until(result) : result;
      };
    },
  });
}
