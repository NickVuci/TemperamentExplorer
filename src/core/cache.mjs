// Small value-keyed caches: mutable tuning objects must never be cache keys.
export class BoundedCache {
  constructor(limit) {
    this.limit = limit;
    this.entries = new Map();
  }
  get(key, create) {
    if (this.entries.has(key)) {
      const value = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, value);
      return value;
    }
    const value = create();
    this.entries.set(key, value);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return value;
  }
}

export function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
