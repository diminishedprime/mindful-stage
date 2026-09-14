import { Direction } from "./types";

export class Ring<
  Item,
  Key extends string | number = Item extends string | number ? Item : never,
> {
  private constructor(
    private readonly items: readonly Item[],
    private readonly keyForItem: (item: Item) => Key,
  ) {}

  static of<Item extends string | number>(
    items: readonly Item[],
  ): Ring<Item, Item> {
    return new Ring(items, (item) => item);
  }

  static keyed<Item, Key extends string | number>(
    items: readonly Item[],
    keyForItem: (item: Item) => Key,
  ): Ring<Item, Key> {
    return new Ring(items, keyForItem);
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  first(direction: Direction): Item | undefined {
    return this.at(0, direction);
  }

  beyond(cursor: Key, direction: Direction): Item | undefined {
    switch (direction) {
      case Direction.Next:
        return this.items[this.upperBound(cursor)];
      case Direction.Previous:
        return this.items[this.lowerBound(cursor) - 1];
    }
  }

  atOrBefore(key: Key): Item | undefined {
    return this.items[this.upperBound(key) - 1];
  }

  all(direction: Direction): Iterable<Item> {
    return this.walk(direction, 0, this.items.length);
  }

  from(home: Key, direction: Direction): Iterable<Item> {
    return this.walk(
      direction,
      this.travelled(home, direction),
      this.items.length + 1,
    );
  }

  after(home: Key, direction: Direction): Iterable<Item> {
    return this.walk(
      direction,
      this.travelled(home, direction) + 1,
      this.items.length,
    );
  }

  private *walk(
    direction: Direction,
    from: number,
    stops: number,
  ): Iterable<Item> {
    if (this.items.length === 0) {
      return;
    }
    for (let step = 0; step < stops; step += 1) {
      yield this.at((from + step) % this.items.length, direction)!;
    }
  }

  private at(travelled: number, direction: Direction): Item | undefined {
    switch (direction) {
      case Direction.Next:
        return this.items[travelled];
      case Direction.Previous:
        return this.items[this.items.length - 1 - travelled];
    }
  }

  private travelled(home: Key, direction: Direction): number {
    const at = this.lowerBound(home);
    switch (direction) {
      case Direction.Next:
        return at;
      case Direction.Previous:
        return this.items.length - 1 - at;
    }
  }

  private lowerBound(key: Key): number {
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.keyForItem(this.items[mid]!) < key) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  private upperBound(key: Key): number {
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.keyForItem(this.items[mid]!) <= key) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }
}
