export function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, offset) => start + offset);
}
