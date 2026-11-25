const parseSemver = (value) => {
  const raw = String(value || '').trim().replace(/^v/i, '')
  if (!raw) return null
  const [corePart, prePart = ''] = raw.split('-', 2)
  const coreSegments = corePart.split('.').map((part) => {
    if (!/^\d+$/.test(part)) return NaN
    return Number.parseInt(part, 10)
  })
  if (coreSegments.length === 0 || coreSegments.some(num => !Number.isFinite(num))) {
    return null
  }
  const preSegments = prePart ? prePart.split('.').filter(Boolean) : []
  return { core: coreSegments, pre: preSegments }
}

export const isNewerVersion = (latest, current) => {
  const next = parseSemver(latest)
  const curr = parseSemver(current)
  if (!next || !curr) return false

  const maxLen = Math.max(next.core.length, curr.core.length)
  for (let i = 0; i < maxLen; i += 1) {
    const a = next.core[i] ?? 0
    const b = curr.core[i] ?? 0
    if (a !== b) return a > b
  }

  if (next.pre.length === 0 && curr.pre.length === 0) return false
  if (next.pre.length === 0) return true
  if (curr.pre.length === 0) return false

  const preLen = Math.max(next.pre.length, curr.pre.length)
  for (let i = 0; i < preLen; i += 1) {
    const a = next.pre[i]
    const b = curr.pre[i]
    if (a === undefined) return false
    if (b === undefined) return true
    if (a === b) continue
    const aNum = /^\d+$/.test(a) ? Number.parseInt(a, 10) : null
    const bNum = /^\d+$/.test(b) ? Number.parseInt(b, 10) : null
    if (aNum !== null && bNum !== null) return aNum > bNum
    if (aNum !== null) return false
    if (bNum !== null) return true
    return a > b
  }

  return false
}
