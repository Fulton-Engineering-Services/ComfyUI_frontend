import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import type { AugmentedResultItem } from '@/utils/resultItem'
import { isResultItemType } from '@/utils/typeGuardUtil'

import type { AssetMeta } from '../schemas/mediaAssetSchema'

export const useMediaAssetGalleryStore = defineStore(
  'mediaAssetGallery',
  () => {
    const activeIndex = ref(-1)
    const items = shallowRef<AugmentedResultItem[]>([])

    const close = () => {
      activeIndex.value = -1
    }

    const openSingle = (asset: AssetMeta) => {
      items.value = [
        {
          filename: asset.name,
          subfolder: '',
          // Use the asset's own directory type, not an assumed 'output': the
          // lightbox builds the VHS /viewvideo URL from this, so forcing
          // 'output' 204s any input-tree file.
          type: asset.tags.find(isResultItemType) ?? 'output',
          nodeId: '0',
          mediaType: asset.kind === 'image' ? 'images' : asset.kind,
          url: asset.src || ''
        }
      ]
      activeIndex.value = 0
    }

    return {
      activeIndex,
      items,
      close,
      openSingle
    }
  }
)
