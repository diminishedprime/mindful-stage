type Span = { kind: string; start: number; end: number };

export class Timeline {
  private readonly spans: Span[] = [];
  private origin = performance.now();

  restart(): void {
    this.spans.length = 0;
    this.origin = performance.now();
  }

  async span<T>(kind: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now() - this.origin;
    try {
      return await work();
    } finally {
      this.spans.push({ kind, start, end: performance.now() - this.origin });
    }
  }

  summary(): string[] {
    const kinds = Map.groupBy(this.spans, (span) => span.kind);
    return [...kinds]
      .map(([kind, spans]) => ({
        kind,
        count: spans.length,
        first: spans.reduce((min, span) => Math.min(min, span.start), Infinity),
        last: spans.reduce((max, span) => Math.max(max, span.end), -Infinity),
        total: spans.reduce((sum, span) => sum + span.end - span.start, 0),
      }))
      .sort((a, b) => a.first - b.first)
      .map(
        ({ kind, count, first, last, total }) =>
          `${kind.padEnd(12)} x${String(count).padEnd(5)} ${first.toFixed(0).padStart(5)}ms -> ${last.toFixed(0).padStart(5)}ms  summed ${total.toFixed(0)}ms`,
      );
  }
}
