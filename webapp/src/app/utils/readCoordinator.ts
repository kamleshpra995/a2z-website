export interface ReadCoordinator<T> {
  invalidate(): void;
  read(options?: { fresh?: boolean }): Promise<T | undefined>;
}

/** Coalesce overlapping reads and discard results belonging to a previous login. */
export function createReadCoordinator<T>(load: () => T | Promise<T>): ReadCoordinator<T> {
  let generation = 0;
  let pending: { promise: Promise<T | undefined> } | null = null;
  return {
    invalidate() {
      generation++;
      pending = null;
    },
    async read({ fresh = false } = {}) {
      const requestedGeneration = generation;
      // After a write, wait for the older read and then fetch the committed state.
      if (fresh && pending) await pending.promise.catch(() => {});
      if (requestedGeneration !== generation) return undefined;
      if (pending) return pending.promise;
      const entry: { promise: Promise<T | undefined> } = {
        promise: Promise.resolve()
          .then(load)
          .then((value) => (requestedGeneration === generation ? value : undefined))
          .catch((error: unknown) => {
            if (requestedGeneration !== generation) return undefined;
            throw error;
          })
          .finally(() => {
            if (pending === entry) pending = null;
          }),
      };
      pending = entry;
      return entry.promise;
    },
  };
}
