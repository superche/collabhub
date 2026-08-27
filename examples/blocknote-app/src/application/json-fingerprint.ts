function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

export function jsonFingerprint(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
