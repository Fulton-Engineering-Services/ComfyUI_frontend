<template>
  <div
    ref="container"
    class="h-full scrollbar-thin scrollbar-thumb-(--dialog-surface) scrollbar-track-transparent scrollbar-gutter-stable overflow-y-auto [overflow-anchor:none]"
  >
    <div :style="topSpacerStyle" />
    <div :style="mergedGridStyle">
      <div
        v-for="(item, i) in renderedItems"
        :key="item.key"
        data-virtual-grid-item
        :class="wrapperClass(item, i)"
        :data-virtual-grid-measure-skip="measureSkip?.(item) ? '' : undefined"
      >
        <slot name="item" :item :index="state.start + i" />
      </div>
    </div>
    <div :style="bottomSpacerStyle" />
  </div>
</template>

<script setup lang="ts" generic="T">
import {
  useElementSize,
  useInfiniteScroll,
  useScroll,
  whenever
} from '@vueuse/core'
import { clamp, debounce } from 'es-toolkit/compat'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

type GridState = {
  start: number
  end: number
}

const {
  items,
  gridStyle,
  bufferRows = 1,
  resizeDebounce = 64,
  defaultItemHeight = 200,
  defaultItemWidth = 200,
  maxColumns = Infinity,
  onLoadMore,
  canLoadMore = false,
  itemClass,
  measureSkip,
  isFullWidthItem,
  fullRowHeight
} = defineProps<{
  items: (T & { key: string })[]
  gridStyle: CSSProperties
  bufferRows?: number
  resizeDebounce?: number
  defaultItemHeight?: number
  defaultItemWidth?: number
  maxColumns?: number
  onLoadMore?: () => unknown
  canLoadMore?: boolean
  /** Optional per-item class applied to the wrapper element that is the actual CSS-grid child. */
  itemClass?: (item: T & { key: string }, index: number) => string | undefined
  /** Optional predicate: when true for an item, it is excluded from item-size measurement. */
  measureSkip?: (item: T & { key: string }) => boolean
  /**
   * Optional predicate: when true for an item, it spans the full grid width and
   * occupies its own row. Enables group-header rows inside a card grid.
   * When omitted, the uniform-row math is used (no behavioral change).
   */
  isFullWidthItem?: (item: T & { key: string }) => boolean
  /** Row height for a full-width item; defaults to the measured card height. */
  fullRowHeight?: number
}>()

function wrapperClass(
  item: T & { key: string },
  index: number
): string | undefined {
  return itemClass?.(item, index)
}

const itemHeight = ref(defaultItemHeight)
const itemWidth = ref(defaultItemWidth)
const container = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(container)
const { y: scrollY } = useScroll(container, {
  eventListenerOptions: { passive: true }
})

const cols = computed(() => {
  if (maxColumns !== Infinity) return maxColumns
  return Math.floor(width.value / itemWidth.value) || 1
})

const mergedGridStyle = computed<CSSProperties>(() => {
  if (maxColumns === Infinity) return gridStyle
  return {
    ...gridStyle,
    gridTemplateColumns: `repeat(${maxColumns}, minmax(0, 1fr))`
  }
})

const viewRows = computed(() => Math.ceil(height.value / itemHeight.value))
const offsetRows = computed(() => Math.floor(scrollY.value / itemHeight.value))
const isValidGrid = computed(() => height.value && width.value && items?.length)

/**
 * Uniform-row model (no full-width items): identical to the original math.
 * A card row is `itemHeight` tall and holds `cols` items.
 */
function uniformState(): GridState {
  const fromRow = offsetRows.value - bufferRows
  const toRow = offsetRows.value + bufferRows + viewRows.value
  const fromCol = fromRow * cols.value
  const toCol = toRow * cols.value
  const total = items?.length ?? 0
  const windowSize = Math.max(toCol - fromCol, 0)
  const end = clamp(toCol, 0, total)
  let start = clamp(fromCol, 0, end)
  if (start === end && total > 0) {
    start = Math.max(0, end - windowSize)
  }
  return { start, end }
}

/**
 * Mixed-row model for group-header items. Active only when `isFullWidthItem`
 * is provided. Each card fills 1/cols of an `itemHeight` row; each full-width
 * item owns its own `fullRowHeight` row. Rows are segmented by full-width
 * items. Offsets are recomputed when items/height/width change, then the
 * scroll window is found by binary search over the (non-decreasing) offset
 * array.
 */
interface GridWindow {
  start: number
  end: number
  /** Pixel height of all rows above `start` (top spacer). */
  topPx: number
  /** Pixel offset where the bottom spacer begins. */
  bottomRefPx: number
  /** Total content height in pixels. */
  totalHeight: number
}

/**
 * Uniform-row model (no full-width items). Reproduces the original spacer
 * values exactly so existing callers are byte-identical.
 */
function uniformWindow(): GridWindow {
  const { start, end } = uniformState()
  const total = items?.length ?? 0
  const topPx = Math.ceil(start / cols.value) * itemHeight.value
  const totalHeight = Math.ceil(total / cols.value) * itemHeight.value
  const bottomSpacer = Math.ceil((total - end) / cols.value) * itemHeight.value
  return {
    start,
    end,
    topPx,
    bottomRefPx: totalHeight - bottomSpacer,
    totalHeight
  }
}

/**
 * Cumulative row offsets, one entry per item plus a sentinel for the total
 * height. Deliberately independent of `scrollY`/`height` so scrolling only
 * does two binary searches over a cached array instead of rebuilding it every
 * frame — that would make virtualization O(n) per scroll frame.
 */
const mixedOffsets = computed(() => {
  const n = items?.length ?? 0
  const fullRow = fullRowHeight ?? itemHeight.value
  const result = Array.from<number>({ length: n + 1 })
  result[0] = 0
  let rowStart = 0
  let colInRow = 0
  for (let i = 0; i < n; i++) {
    if (isFullWidthItem?.(items[i])) {
      // Flush a partially-filled card row so the header starts on its own row.
      if (colInRow > 0) rowStart += itemHeight.value
      colInRow = 0
      rowStart += fullRow
      result[i] = rowStart - fullRow
    } else {
      result[i] = rowStart
      colInRow++
      if (colInRow === cols.value) {
        rowStart += itemHeight.value
        colInRow = 0
      }
    }
  }
  const totalHeight = rowStart + (colInRow > 0 ? itemHeight.value : 0)
  result[n] = totalHeight
  return { offsets: result, totalHeight }
})

function mixedState(): GridWindow {
  const { offsets, totalHeight } = mixedOffsets.value
  const n = offsets.length - 1
  const bufferPx = bufferRows * itemHeight.value
  const topPx = scrollY.value - bufferPx
  const bottomPx = scrollY.value + height.value + bufferPx

  // First index whose offset exceeds the top boundary.
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] < topPx) lo = mid + 1
    else hi = mid
  }
  let start = lo

  // First index whose offset is at or past the bottom boundary.
  lo = start
  hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] < bottomPx) lo = mid + 1
    else hi = mid
  }
  let end = lo

  if (start === end && n > 0) {
    start = Math.max(0, end - (viewRows.value * cols.value + 2))
  }
  start = clamp(start, 0, n)
  end = clamp(end, 0, n)
  return {
    start,
    end,
    topPx: offsets[start],
    bottomRefPx: offsets[end],
    totalHeight
  }
}

const state = computed<GridWindow>(() =>
  isFullWidthItem ? mixedState() : uniformWindow()
)
const renderedItems = computed(() =>
  isValidGrid.value ? items.slice(state.value.start, state.value.end) : []
)

const topSpacerStyle = computed<CSSProperties>(() => ({
  height: `${state.value.topPx}px`
}))
const bottomSpacerStyle = computed<CSSProperties>(() => ({
  height: `${state.value.totalHeight - state.value.bottomRefPx}px`
}))

const distance = 2 * defaultItemHeight * (1 + bufferRows)
useInfiniteScroll(
  container,
  async () => {
    await onLoadMore?.()
  },
  { canLoadMore: () => canLoadMore, distance }
)

function updateItemSize(): void {
  if (container.value) {
    const allItems = container.value.querySelectorAll(
      '[data-virtual-grid-item]'
    )
    // Measure the first non-skip item (skip headers so cols/height come from a real card).
    const firstItem = (
      allItems.length
        ? (Array.from(allItems).find(
            (el) => !el.hasAttribute('data-virtual-grid-measure-skip')
          ) ?? allItems[0])
        : null
    ) as HTMLElement | null

    if (!firstItem?.clientHeight || !firstItem?.clientWidth) return

    if (itemHeight.value !== firstItem.clientHeight) {
      itemHeight.value = firstItem.clientHeight
    }
    if (itemWidth.value !== firstItem.clientWidth) {
      itemWidth.value = firstItem.clientWidth
    }
  }
}
const onResize = debounce(updateItemSize, resizeDebounce)
watch([width, height], onResize, { flush: 'post' })
watch(() => gridStyle, updateItemSize, { flush: 'post' })
whenever(() => items, updateItemSize, { flush: 'post' })
onBeforeUnmount(() => {
  onResize.cancel()
})
</script>
