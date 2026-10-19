<template>
  <div class="flex h-full flex-col">
    <!-- Assets Grid -->
    <VirtualGrid
      class="flex-1"
      :items="groupedAssets?.length ? flatItems : assetItems"
      :item-class="groupedAssets?.length ? itemClassFor : undefined"
      :measure-skip="groupedAssets?.length ? isHeader : undefined"
      :is-full-width-item="groupedAssets?.length ? isHeader : undefined"
      :full-row-height="HEADER_ROW_HEIGHT"
      :grid-style
      :on-load-more
      :can-load-more
    >
      <template #item="{ item }">
        <button
          v-if="isHeader(item)"
          type="button"
          class="flex h-8 w-full items-center gap-2 border-b border-comfy-input px-1 text-xs font-medium text-muted-foreground hover:text-text-primary"
          :aria-expanded="!(item as { collapsed: boolean }).collapsed"
          @click.stop="emit('toggle-group', (item as { key: string }).key)"
        >
          <i
            :class="
              cn(
                'icon-[lucide--chevron-down] size-3.5 shrink-0 transition-transform',
                (item as { collapsed: boolean }).collapsed && '-rotate-90'
              )
            "
            aria-hidden="true"
          />
          <span>{{ (item as { label: string }).label }}</span>
          <span class="text-muted-foreground/60">{{
            (item as { count: number }).count
          }}</span>
        </button>
        <MediaAssetCard
          v-else
          :asset="(item as AssetGridItem).asset"
          :selected="isSelected((item as AssetGridItem).asset.id)"
          :show-output-count="showOutputCount((item as AssetGridItem).asset)"
          :output-count="getOutputCount((item as AssetGridItem).asset)"
          :show-native-video-controls="
            gridMode !== MEDIA_ASSET_GRID_MODE.gridSmall
          "
          @select="emit('select-asset', (item as AssetGridItem).asset)"
          @toggle-selection="
            emit('toggle-asset-selection', (item as AssetGridItem).asset)
          "
          @context-menu="
            emit('context-menu', $event, (item as AssetGridItem).asset)
          "
          @zoom="emit('zoom', (item as AssetGridItem).asset)"
          @output-count-click="
            emit('output-count-click', (item as AssetGridItem).asset)
          "
        />
      </template>
    </VirtualGrid>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import VirtualGrid from '@/components/common/VirtualGrid.vue'
import MediaAssetCard from '@/platform/assets/components/MediaAssetCard.vue'
import {
  getMediaAssetGridColumns,
  MEDIA_ASSET_GRID_MODE
} from '@/platform/assets/components/mediaAssetViewOptions'
import type { MediaAssetGridMode } from '@/platform/assets/components/mediaAssetViewOptions'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import { cn } from '@comfyorg/tailwind-utils'

const {
  assets,
  isSelected,
  showOutputCount,
  getOutputCount,
  gridMode,
  groupedAssets,
  collapsedGroups
} = defineProps<{
  assets: AssetItem[]
  isSelected: (assetId: string) => boolean
  showOutputCount: (asset: AssetItem) => boolean
  getOutputCount: (asset: AssetItem) => number
  gridMode: MediaAssetGridMode
  onLoadMore?: () => unknown
  canLoadMore?: boolean
  groupedAssets?: { key: string; items: AssetItem[] }[]
  collapsedGroups?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'select-asset', asset: AssetItem): void
  (e: 'toggle-asset-selection', asset: AssetItem): void
  (e: 'context-menu', event: MouseEvent, asset: AssetItem): void
  (e: 'zoom', asset: AssetItem): void
  (e: 'output-count-click', asset: AssetItem): void
  (e: 'toggle-group', key: string): void
}>()

type AssetGridItem = { key: string; asset: AssetItem }

type FlatGridItem =
  | {
      type: 'header'
      key: string
      label: string
      count: number
      collapsed: boolean
    }
  | AssetGridItem

const assetItems = computed<AssetGridItem[]>(() =>
  assets.map((asset) => ({
    key: `asset-${asset.id}`,
    asset
  }))
)

const flatItems = computed<FlatGridItem[]>(() => {
  if (!groupedAssets?.length) return []
  const out: FlatGridItem[] = []
  for (const { key, items } of groupedAssets) {
    const collapsed = collapsedGroups?.has(key) ?? false
    out.push({
      type: 'header',
      key,
      label: key,
      count: items.length,
      collapsed
    })
    if (collapsed) continue
    for (const asset of items) {
      out.push({ key: `asset-${asset.id}`, asset })
    }
  }
  return out
})

const isHeader = (item: FlatGridItem | AssetGridItem) =>
  'type' in item && item.type === 'header'

// The header wrapper is the CSS-grid child, so it (not the slot content) must
// span all columns.
const itemClassFor = (
  item: FlatGridItem | AssetGridItem
): string | undefined => (isHeader(item) ? 'col-span-full' : undefined)

const HEADER_ROW_HEIGHT = 32

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: getMediaAssetGridColumns(gridMode),
  padding: '0 0.5rem',
  gap: '0.5rem'
}))
</script>
