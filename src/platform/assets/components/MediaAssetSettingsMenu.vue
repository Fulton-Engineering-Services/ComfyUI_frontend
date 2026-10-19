<template>
  <div class="flex flex-col">
    <Button
      variant="textonly"
      class="w-full"
      @click="handleViewModeChange(MEDIA_ASSET_VIEW_MODE.list)"
    >
      <span class="flex items-center gap-2">
        <i class="icon-[lucide--table-of-contents] size-4" />
        <span>{{ $t('sideToolbar.queueProgressOverlay.viewList') }}</span>
      </span>
      <i
        class="ml-auto icon-[lucide--check] size-4"
        :class="viewMode !== MEDIA_ASSET_VIEW_MODE.list && 'opacity-0'"
      />
    </Button>

    <Button
      variant="textonly"
      class="w-full"
      @click="handleViewModeChange(MEDIA_ASSET_VIEW_MODE.gridSmall)"
    >
      <span class="flex items-center gap-2">
        <i class="icon-[lucide--grid-3x3] size-4" />
        <span>{{ $t('sideToolbar.mediaAssets.viewGridSmall') }}</span>
      </span>
      <i
        class="ml-auto icon-[lucide--check] size-4"
        :class="viewMode !== MEDIA_ASSET_VIEW_MODE.gridSmall && 'opacity-0'"
      />
    </Button>

    <Button
      variant="textonly"
      class="w-full"
      @click="handleViewModeChange(MEDIA_ASSET_VIEW_MODE.grid)"
    >
      <span class="flex items-center gap-2">
        <i class="icon-[lucide--layout-grid] size-4" />
        <span>{{ $t('sideToolbar.mediaAssets.viewGridLarge') }}</span>
      </span>
      <i
        class="ml-auto icon-[lucide--check] size-4"
        :class="viewMode !== MEDIA_ASSET_VIEW_MODE.grid && 'opacity-0'"
      />
    </Button>

    <template v-if="showSortOptions">
      <div class="my-1 w-full border-b border-border-subtle" />

      <Button
        variant="textonly"
        class="w-full"
        @click="handleSortChange('newest')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.sortNewestFirst') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="sortBy !== 'newest' && 'opacity-0'"
        />
      </Button>

      <Button
        variant="textonly"
        class="w-full"
        @click="handleSortChange('oldest')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.sortOldestFirst') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="sortBy !== 'oldest' && 'opacity-0'"
        />
      </Button>

      <Button variant="textonly" class="w-full" @click="handleSortChange('az')">
        <span>{{ $t('sideToolbar.mediaAssets.sortAToZ') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="sortBy !== 'az' && 'opacity-0'"
        />
      </Button>

      <Button variant="textonly" class="w-full" @click="handleSortChange('za')">
        <span>{{ $t('sideToolbar.mediaAssets.sortZToA') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="sortBy !== 'za' && 'opacity-0'"
        />
      </Button>

      <template v-if="showGenerationTimeSort">
        <Button
          variant="textonly"
          class="w-full"
          @click="handleSortChange('longest')"
        >
          <span>{{ $t('sideToolbar.mediaAssets.sortLongestFirst') }}</span>
          <i
            class="ml-auto icon-[lucide--check] size-4"
            :class="sortBy !== 'longest' && 'opacity-0'"
          />
        </Button>

        <Button
          variant="textonly"
          class="w-full"
          @click="handleSortChange('fastest')"
        >
          <span>{{ $t('sideToolbar.mediaAssets.sortFastestFirst') }}</span>
          <i
            class="ml-auto icon-[lucide--check] size-4"
            :class="sortBy !== 'fastest' && 'opacity-0'"
          />
        </Button>
      </template>
    </template>
    <template v-if="showGroupOptions">
      <div class="my-1 w-full border-b border-border-subtle" />
      <Button
        variant="textonly"
        class="w-full"
        @click="handleGroupChange('none')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.groupNone') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="groupBy !== 'none' && 'opacity-0'"
        />
      </Button>
      <Button
        variant="textonly"
        class="w-full"
        @click="handleGroupChange('fileType')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.groupByType') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="groupBy !== 'fileType' && 'opacity-0'"
        />
      </Button>
      <Button
        variant="textonly"
        class="w-full"
        @click="handleGroupChange('createdDate')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.groupByCreatedDate') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="groupBy !== 'createdDate' && 'opacity-0'"
        />
      </Button>
      <Button
        variant="textonly"
        class="w-full"
        @click="handleGroupChange('updatedDate')"
      >
        <span>{{ $t('sideToolbar.mediaAssets.groupByUpdatedDate') }}</span>
        <i
          class="ml-auto icon-[lucide--check] size-4"
          :class="groupBy !== 'updatedDate' && 'opacity-0'"
        />
      </Button>
    </template>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'

import type { GroupByOption } from '../composables/useMediaAssetGrouping'
import { MEDIA_ASSET_VIEW_MODE } from './mediaAssetViewOptions'
import type { MediaAssetViewMode } from './mediaAssetViewOptions'

export type SortBy = 'newest' | 'oldest' | 'az' | 'za' | 'longest' | 'fastest'

const {
  showSortOptions = false,
  showGroupOptions = false,
  showGenerationTimeSort = false
} = defineProps<{
  showSortOptions?: boolean
  showGroupOptions?: boolean
  showGenerationTimeSort?: boolean
}>()

const viewMode = defineModel<MediaAssetViewMode>('viewMode', { required: true })
const sortBy = defineModel<SortBy>('sortBy', { required: true })
const groupBy = defineModel<GroupByOption>('groupBy', { default: 'none' })

function handleViewModeChange(value: MediaAssetViewMode) {
  viewMode.value = value
}

function handleSortChange(value: SortBy) {
  sortBy.value = value
}

function handleGroupChange(value: GroupByOption) {
  groupBy.value = value
}
</script>
