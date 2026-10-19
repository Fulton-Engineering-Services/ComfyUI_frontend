import { fromPartial } from '@total-typescript/shoehorn'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'

import { useMediaAssetGrouping } from '@/platform/assets/composables/useMediaAssetGrouping'
import type { GroupByOption } from '@/platform/assets/composables/useMediaAssetGrouping'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'

interface AssetSpec {
  id: string
  name: string
  createdAt?: number
  /**
   * Raw local-datetime string, matching what the assets API actually sends
   * (`zAsset.created_at` is `.datetime({ local: true })`, no offset).
   */
  createdAtLocal?: string
  updatedAt?: number
}

function makeAsset(spec: AssetSpec): AssetItem {
  return fromPartial({
    id: spec.id,
    name: spec.name,
    tags: [],
    created_at:
      spec.createdAtLocal !== undefined
        ? spec.createdAtLocal
        : spec.createdAt !== undefined
          ? new Date(spec.createdAt).toISOString()
          : undefined,
    updated_at:
      spec.updatedAt !== undefined
        ? new Date(spec.updatedAt).toISOString()
        : undefined
  })
}

function group(
  assets: AssetItem[],
  groupBy: GroupByOption
): { key: string; ids: string[] }[] {
  const scope = effectScope()
  return scope.run(() => {
    const { groupedAssets } = useMediaAssetGrouping(ref(assets), ref(groupBy))
    return groupedAssets.value.map((g) => ({
      key: g.key,
      ids: g.items.map((a) => a.id)
    }))
  })!
}

const DAY = 86_400_000
const D1 = Date.UTC(2026, 9, 18)
const D2 = Date.UTC(2026, 9, 19)

describe('useMediaAssetGrouping', () => {
  it('returns no groups for groupBy=none', () => {
    const assets = [makeAsset({ id: 'a', name: 'a.png' })]
    expect(group(assets, 'none')).toEqual([])
  })

  it('groups by file type, preserving input order within each group', () => {
    const a = makeAsset({ id: 'a', name: 'a.png' })
    const b = makeAsset({ id: 'b', name: 'b.mp4' })
    const c = makeAsset({ id: 'c', name: 'c.txt' })

    expect(group([a, b, c], 'fileType')).toEqual([
      { key: 'image', ids: ['a'] },
      { key: 'video', ids: ['b'] },
      { key: 'text', ids: ['c'] }
    ])
  })

  it('keeps the raw 3D file-type key', () => {
    const a = makeAsset({ id: 'a', name: 'model.glb' })
    expect(group([a], 'fileType')).toEqual([{ key: '3D', ids: ['a'] }])
  })

  it('groups by created date and keeps newest-day-first for newest-first input', () => {
    const newer = makeAsset({ id: 'newer', name: 'a.png', createdAt: D2 })
    const older = makeAsset({ id: 'older', name: 'b.png', createdAt: D1 })

    expect(group([newer, older], 'createdDate')).toEqual([
      { key: '2026-10-19', ids: ['newer'] },
      { key: '2026-10-18', ids: ['older'] }
    ])
  })

  it('puts same-day assets in one bucket', () => {
    const a = makeAsset({ id: 'a', name: 'a.png', createdAt: D1 })
    const b = makeAsset({ id: 'b', name: 'b.png', createdAt: D1 + 3600_000 })

    expect(group([a, b], 'createdDate')).toEqual([
      { key: '2026-10-18', ids: ['a', 'b'] }
    ])
  })

  it('uses updated_at for updatedDate and falls back to created_at', () => {
    const moved = makeAsset({
      id: 'moved',
      name: 'a.png',
      createdAt: D1,
      updatedAt: D2
    })
    const untouched = makeAsset({
      id: 'untouched',
      name: 'b.png',
      createdAt: D1
    })

    expect(group([moved, untouched], 'updatedDate')).toEqual([
      { key: '2026-10-19', ids: ['moved'] },
      { key: '2026-10-18', ids: ['untouched'] }
    ])
  })

  it('never reorders existing buckets as older pages append', () => {
    const page1 = [
      makeAsset({ id: 'p1a', name: 'a.png', createdAt: D2 }),
      makeAsset({ id: 'p1b', name: 'b.png', createdAt: D1 })
    ]
    const page2 = [makeAsset({ id: 'p2a', name: 'c.png', createdAt: D1 - DAY })]

    const groupedPage1 = group(page1, 'createdDate')
    const groupedFull = group([...page1, ...page2], 'createdDate')

    expect(groupedFull.slice(0, groupedPage1.length)).toEqual(groupedPage1)
    expect(groupedFull.at(-1)).toEqual({
      key: '2026-10-17',
      ids: ['p2a']
    })
  })

  // vitest pins TZ=UTC (vite.config.mts), so every other case here passes
  // identically whether the day key is derived from local parts or from
  // `toISOString()`. Override the zone at runtime to actually guard the fix:
  // 23:30 local on Oct 18 is Oct 19 in UTC, so a UTC-derived key would shift
  // the asset into the wrong day.
  describe('from a zone west of UTC', () => {
    beforeAll(() => {
      process.env.TZ = 'America/Los_Angeles'
    })
    afterAll(() => {
      process.env.TZ = 'UTC'
    })

    it('buckets a late-evening asset on its own local calendar day', () => {
      const lateEvening = makeAsset({
        id: 'late',
        name: 'a.png',
        createdAtLocal: '2026-10-18T23:30:00'
      })

      expect(group([lateEvening], 'createdDate')).toEqual([
        { key: '2026-10-18', ids: ['late'] }
      ])
    })
  })
})
