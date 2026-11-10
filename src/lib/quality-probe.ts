/** Which probe the quality band shows, by name. Null = all probes. */

const KEY = "quality-probe"

export function readProbe(storage: Storage = globalThis.localStorage): string | null {
  const saved = storage.getItem(KEY)
  return saved ? saved : null
}

export function saveProbe(probe: string | null, storage: Storage = globalThis.localStorage): void {
  if (probe) storage.setItem(KEY, probe)
  else storage.removeItem(KEY)
}
