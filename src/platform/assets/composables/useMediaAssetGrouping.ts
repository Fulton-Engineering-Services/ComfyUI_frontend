import { computed, toValue } from 'vue'
import type { MaybeRef } from 'vue'

import { getAssetTime } from '@/platform/assets/composables/useMediaAssetFiltering'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import { getMediaTypeFromFilename } from '@/utils/formatUtil'

export type GroupByOption = 'none' | 'fileType' | 'createdDate' | 'updatedDate'

export interface AssetGroup {
  key: string
  items: AssetItem[]
}

const getAssetUpdatedTime = (asset: AssetItem): number => {
  const updated = asset.updated_at ? new Date(asset.updated_at).getTime() : 0
  if (updated) return updated
  return getAssetTime(asset)
}

/**
 * `created_at`/`updated_at` are local datetimes (no offset), so `new Date(...)`
 * parses them in local time. Build the key from local calendar parts so a
 * late-evening asset buckets on the user's own calendar day rather than
 * shifting across a day boundary via `toISOString()`'s UTC conversion.
 */
const toDayKey = (ms: number): string => {
  if (!ms) return ''
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const getGroupKey = (asset: AssetItem, mode: GroupByOption): string => {
  switch (mode) {
    case 'fileType':
      // '3D' stays uppercased, matching getMediaTypeFromFilename's raw output.
      return getMediaTypeFromFilename(asset.name)
    case 'createdDate':
      return toDayKey(getAssetTime(asset))
    case 'updatedDate':
      return toDayKey(getAssetUpdatedTime(asset))
    case 'none':
    default:
      return ''
  }
}

/**
 * Group assets by the selected mode. `none` returns an empty array — the
 * single implicit group is the ungrouped list the caller already has.
 *
 * Buckets are a `Map`, so their order is FIRST-ENCOUNTERED-ASSET order, which
 * equals the caller's sort position. Because the caller passes already-sorted
 * `filteredAssets` (default newest-first), created/updated-date buckets come
 * out newest-day-first, and file-type buckets come out in the order the first
 * asset of each type appears. Within a bucket the input order is preserved, so
 * the chosen sort still applies. No re-sorting of groups.
 */
export function useMediaAssetGrouping(
  assets: MaybeRef<readonly AssetItem[]>,
  groupBy: MaybeRef<GroupByOption>
) {
  const groupedAssets = computed<AssetGroup[]>(() => {
    const mode = toValue(groupBy)
    if (mode === 'none') return []
    const groups = new Map<string, AssetItem[]>()
    for (const asset of toValue(assets)) {
      const key = getGroupKey(asset, mode)
      const list = groups.get(key)
      if (list) list.push(asset)
      else groups.set(key, [asset])
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items }))
  })
  return { groupedAssets }
}
