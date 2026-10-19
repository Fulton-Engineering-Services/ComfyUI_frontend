<template>
  <div class="flex h-full flex-col">
    <VirtualGrid
      class="flex-1"
      :items="groupedAssets?.length ? flatItems : assetItems"
      :measure-skip="groupedAssets?.length ? isHeader : undefined"
      :is-full-width-item="groupedAssets?.length ? isHeader : undefined"
      :full-row-height="48"
      :grid-style="listGridStyle"
      :max-columns="1"
      :default-item-height="48"
      :on-load-more
      :can-load-more
    >
      <template #item="{ item }">
        <button
          v-if="isHeader(item)"
          type="button"
          class="flex h-12 w-full items-center gap-2 px-3 text-xs font-medium text-muted-foreground hover:text-text-primary"
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
        <div v-else class="relative">
          <LoadingOverlay
            :loading="assetsStore.isAssetDeleting(item.asset.id)"
            size="sm"
          >
            <i class="pi pi-trash text-xs" />
          </LoadingOverlay>
          <AssetsListItem
            role="button"
            tabindex="0"
            :aria-label="
              t('assetBrowser.ariaLabel.assetCard', {
                name: getAssetDisplayName(item.asset),
                type: getAssetMediaType(item.asset)
              })
            "
            :class="
              cn(
                getAssetCardClass(isSelected(item.asset.id)),
                'isChild' in item && item.isChild && 'pl-6'
              )
            "
            :preview-url="getAssetPreviewUrl(item.asset)"
            :preview-alt="getAssetDisplayName(item.asset)"
            :icon-name="iconForMediaType(getAssetMediaType(item.asset))"
            :is-video-preview="isVideoAsset(item.asset)"
            :primary-text="getAssetPrimaryText(item.asset)"
            :secondary-text="getAssetSecondaryText(item.asset)"
            :stack-count="getStackCount(item.asset)"
            :stack-indicator-label="t('mediaAsset.actions.seeMoreOutputs')"
            :stack-expanded="isStackExpanded(item.asset)"
            :draggable="true"
            @dragstart="startAssetDrag($event, item.asset)"
            @mouseenter="onAssetEnter(item.asset.id)"
            @mouseleave="onAssetLeave(item.asset.id)"
            @contextmenu.prevent.stop="emit('context-menu', $event, item.asset)"
            @click.stop="emit('select-asset', item.asset, selectableAssets)"
            @dblclick.stop="emit('preview-asset', item.asset)"
            @preview-click="emit('preview-asset', item.asset)"
            @stack-toggle="void toggleStack(item.asset)"
          >
            <template v-if="hoveredAssetId === item.asset.id" #actions>
              <Button
                variant="secondary"
                size="icon"
                :aria-label="t('mediaAsset.actions.moreOptions')"
                @click.stop="emit('context-menu', $event, item.asset)"
              >
                <i class="icon-[lucide--ellipsis] size-4" />
              </Button>
            </template>
          </AssetsListItem>
        </div>
      </template>
    </VirtualGrid>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import VirtualGrid from '@/components/common/VirtualGrid.vue'
import Button from '@/components/ui/button/Button.vue'
import AssetsListItem from '@/platform/assets/components/AssetsListItem.vue'
import type { OutputStackListItem } from '@/platform/assets/composables/useOutputStacks'
import { getOutputAssetMetadata } from '@/platform/assets/schemas/assetMetadataSchema'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'
import { startAssetDrag } from '@/platform/assets/utils/assetDragUtil'
import { getAssetDisplayName } from '@/platform/assets/utils/assetMetadataUtils'
import { iconForMediaType } from '@/platform/assets/utils/mediaIconUtil'
import { useAssetsStore } from '@/stores/assetsStore'
import {
  formatDuration,
  formatSize,
  getMediaTypeFromFilename,
  truncateFilename
} from '@/utils/formatUtil'
import { hdrPreviewAssetUrl, isHdrImageFilename } from '@/utils/hdrFormatUtil'
import { cn } from '@comfyorg/tailwind-utils'

const {
  assetItems,
  selectableAssets,
  isSelected,
  isStackExpanded,
  toggleStack,
  groupedAssets,
  collapsedGroups
} = defineProps<{
  assetItems: OutputStackListItem[]
  selectableAssets: AssetItem[]
  isSelected: (assetId: string) => boolean
  isStackExpanded: (asset: AssetItem) => boolean
  toggleStack: (asset: AssetItem) => Promise<void>
  onLoadMore?: () => unknown
  canLoadMore?: boolean
  groupedAssets?: { key: string; items: AssetItem[] }[]
  collapsedGroups?: Set<string>
}>()

type FlatItem =
  | {
      type: 'header'
      key: string
      label: string
      count: number
      collapsed: boolean
    }
  | { type: 'asset'; key: string; asset: AssetItem }

const flatItems = computed<FlatItem[]>(() => {
  if (!groupedAssets?.length) return []
  const out: FlatItem[] = []
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
    for (const asset of items) out.push({ type: 'asset', key: asset.id, asset })
  }
  return out
})

const isHeader = (item: FlatItem | OutputStackListItem) =>
  'type' in item && item.type === 'header'

const assetsStore = useAssetsStore()

const emit = defineEmits<{
  (e: 'select-asset', asset: AssetItem, assets?: AssetItem[]): void
  (e: 'preview-asset', asset: AssetItem): void
  (e: 'context-menu', event: MouseEvent, asset: AssetItem): void
  (e: 'toggle-group', key: string): void
}>()

const { t } = useI18n()
const hoveredAssetId = ref<string | null>(null)

const listGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  padding: '0 0.5rem',
  gap: '0.5rem'
}

function getAssetPrimaryText(asset: AssetItem): string {
  return truncateFilename(getAssetDisplayName(asset))
}

function getAssetMediaType(asset: AssetItem) {
  return getMediaTypeFromFilename(asset.name)
}

function isVideoAsset(asset: AssetItem): boolean {
  return getAssetMediaType(asset) === 'video'
}

function getAssetPreviewUrl(asset: AssetItem): string {
  const mediaType = getAssetMediaType(asset)
  if (asset.preview_id && isHdrImageFilename(asset.name))
    return hdrPreviewAssetUrl(asset.preview_id)
  if (mediaType === 'image' || mediaType === 'video') {
    return asset.preview_url || ''
  }
  return ''
}

function getAssetSecondaryText(asset: AssetItem): string {
  const metadata = getOutputAssetMetadata(asset.user_metadata)
  if (typeof metadata?.executionTimeInSeconds === 'number') {
    return `${metadata.executionTimeInSeconds.toFixed(2)}s`
  }

  const duration = asset.user_metadata?.duration
  if (typeof duration === 'number') {
    return formatDuration(duration)
  }

  if (typeof asset.size === 'number') {
    return formatSize(asset.size)
  }

  return ''
}

function getStackCount(asset: AssetItem): number | undefined {
  const metadata = getOutputAssetMetadata(asset.user_metadata)
  if (typeof metadata?.outputCount === 'number') {
    return metadata.outputCount
  }

  if (Array.isArray(metadata?.allOutputs)) {
    return metadata.allOutputs.length
  }

  return undefined
}

function getAssetCardClass(selected: boolean): string {
  return cn(
    'w-full text-text-primary transition-colors hover:bg-secondary-background-hover',
    'cursor-pointer',
    selected &&
      'bg-secondary-background-hover ring-1 ring-modal-card-border-highlighted ring-inset'
  )
}

function onAssetEnter(assetId: string) {
  hoveredAssetId.value = assetId
}

function onAssetLeave(assetId: string) {
  if (hoveredAssetId.value === assetId) {
    hoveredAssetId.value = null
  }
}
</script>
