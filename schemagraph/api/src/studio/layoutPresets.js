/**
 * Phase 4.4 — Report Studio layout presets (12-col grid).
 */

export const BOARD_LAYOUT_SLOTS = {
  executive: [
    { col: 0, row: 0, w: 4, h: 3 },
    { col: 4, row: 0, w: 4, h: 3 },
    { col: 8, row: 0, w: 4, h: 3 },
    { col: 0, row: 3, w: 8, h: 5 },
    { col: 8, row: 3, w: 4, h: 5 },
    { col: 0, row: 8, w: 12, h: 4 },
  ],
  ops: [
    { col: 0, row: 0, w: 9, h: 5 },
    { col: 9, row: 0, w: 3, h: 2 },
    { col: 9, row: 2, w: 3, h: 3 },
    { col: 0, row: 5, w: 6, h: 4 },
    { col: 6, row: 5, w: 6, h: 4 },
    { col: 0, row: 9, w: 12, h: 3 },
  ],
  mobile: [
    { col: 0, row: 0, w: 12, h: 3 },
    { col: 0, row: 3, w: 12, h: 3 },
    { col: 0, row: 6, w: 12, h: 3 },
    { col: 0, row: 9, w: 12, h: 4 },
    { col: 0, row: 13, w: 12, h: 4 },
    { col: 0, row: 17, w: 12, h: 4 },
  ],
}

/**
 * @param {string} presetId
 * @param {number} count
 */
export function layoutSlotsForPreset(presetId, count) {
  const slots =
    BOARD_LAYOUT_SLOTS[presetId] || BOARD_LAYOUT_SLOTS.executive
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(
      slots[i] || {
        col: 0,
        row: 99 + i,
        w: 12,
        h: 4,
      },
    )
  }
  return out
}

/**
 * Apply layout preset to report charts (returns patch list — caller persists).
 * @param {object[]} charts
 * @param {string} presetId
 */
export function buildLayoutPatches(charts, presetId) {
  const list = [...(charts || [])].sort((a, b) => {
    const ca = a.config?.layout || {}
    const cb = b.config?.layout || {}
    return (ca.row ?? 0) - (cb.row ?? 0) || (ca.col ?? 0) - (cb.col ?? 0)
  })
  const slots = layoutSlotsForPreset(presetId, list.length)
  return list.map((chart, i) => ({
    chartId: chart.id,
    layout: slots[i],
  }))
}
