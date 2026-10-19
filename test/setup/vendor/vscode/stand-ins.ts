import * as path from "path";

export const sep = path.sep;

export const isLinux = process.platform === "linux";

export type Timeout = ReturnType<typeof setTimeout>;

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
  return str.toLowerCase().startsWith(candidate.toLowerCase());
}

export class URI {
  private constructor(readonly fsPath: string) {}

  static file(fsPath: string): URI {
    return new URI(fsPath);
  }
}

export interface IDisposable {
  dispose(): void;
}

export abstract class Disposable implements IDisposable {
  private readonly registered: IDisposable[] = [];

  dispose(): void {
    for (const disposable of this.registered.splice(0)) {
      disposable.dispose();
    }
  }

  protected _register<T extends IDisposable>(disposable: T): T {
    this.registered.push(disposable);
    return disposable;
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private current: T | undefined;
  private disposed = false;

  get value(): T | undefined {
    return this.disposed ? undefined : this.current;
  }

  set value(value: T | undefined) {
    if (this.disposed || value === this.current) {
      return;
    }
    this.current?.dispose();
    this.current = value;
  }

  clear(): void {
    this.value = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.current?.dispose();
    this.current = undefined;
  }
}
