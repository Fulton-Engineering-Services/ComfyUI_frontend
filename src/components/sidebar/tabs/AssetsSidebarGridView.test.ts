import { fromPartial } from '@total-typescript/shoehorn'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

import { MEDIA_ASSET_GRID_MODE } from '@/platform/assets/components/mediaAssetViewOptions'
import type { MediaAssetGridMode } from '@/platform/assets/components/mediaAssetViewOptions'
import type { AssetItem } from '@/platform/assets/schemas/assetSchema'

import AssetsSidebarGridView from './AssetsSidebarGridView.vue'

const VirtualGridStub = defineComponent({
  name: 'VirtualGrid',
  props: {
    items: {
      type: Array,
      default: () => []
    },
    itemClass: {
      type: Function,
      default: undefined
    }
  },
  template:
    '<div><div v-for="(item, i) in items" :key="item.key" :class="itemClass ? itemClass(item, i) : undefined"><slot name="item" :item="item" /></div></div>'
})

const MediaAssetCardStub = defineComponent({
  name: 'MediaAssetCard',
  props: {
    showNativeVideoControls: {
      type: Boolean,
      default: true
    }
  },
  template:
    '<div data-testid="media-asset-card" :data-show-native-video-controls="showNativeVideoControls" />'
})

const videoAsset: AssetItem = fromPartial({
  id: 'video-asset',
  name: 'clip.mp4',
  tags: []
})

function renderGridView(gridMode: MediaAssetGridMode) {
  return render(AssetsSidebarGridView, {
    props: {
      assets: [videoAsset],
      isSelected: () => false,
      showOutputCount: () => false,
      getOutputCount: () => 0,
      gridMode
    },
    global: {
      stubs: {
        VirtualGrid: VirtualGridStub,
        MediaAssetCard: MediaAssetCardStub
      }
    }
  })
}

describe('AssetsSidebarGridView', () => {
  it.for([
    {
      gridMode: MEDIA_ASSET_GRID_MODE.gridSmall,
      expectedNativeControls: false
    },
    {
      gridMode: MEDIA_ASSET_GRID_MODE.grid,
      expectedNativeControls: true
    }
  ])(
    'sets native video controls to $expectedNativeControls in $gridMode mode',
    ({ gridMode, expectedNativeControls }) => {
      renderGridView(gridMode)

      expect(screen.getByTestId('media-asset-card')).toHaveAttribute(
        'data-show-native-video-controls',
        String(expectedNativeControls)
      )
    }
  )

  it('renders a full-width header row before each group when grouped', () => {
    const img: AssetItem = fromPartial({
      id: 'img-asset',
      name: 'a.png',
      tags: []
    })
    render(AssetsSidebarGridView, {
      props: {
        assets: [img, videoAsset],
        isSelected: () => false,
        showOutputCount: () => false,
        getOutputCount: () => 0,
        gridMode: MEDIA_ASSET_GRID_MODE.grid,
        groupedAssets: [
          { key: 'image', items: [img] },
          { key: 'video', items: [videoAsset] }
        ]
      },
      global: {
        stubs: {
          VirtualGrid: VirtualGridStub,
          MediaAssetCard: MediaAssetCardStub
        }
      }
    })

    const headers = screen.getAllByText(/^(image|video)$/)
    // The header wrapper (the CSS-grid child) must span all columns.
    // eslint-disable-next-line testing-library/no-node-access
    expect(headers[0].closest('.col-span-full')).not.toBeNull()
    // eslint-disable-next-line testing-library/no-node-access
    expect(headers[1].closest('.col-span-full')).not.toBeNull()
    // Both group assets still render as cards.
    expect(screen.getAllByTestId('media-asset-card')).toHaveLength(2)
  })

  it('renders only cards when groupedAssets is absent', () => {
    renderGridView(MEDIA_ASSET_GRID_MODE.grid)
    expect(screen.queryByText(/^(image|video)$/)).toBeNull()
    expect(screen.getAllByTestId('media-asset-card')).toHaveLength(1)
  })

  it('collapses a grid group: header stays full width, cards are dropped', () => {
    const img: AssetItem = fromPartial({
      id: 'img-asset',
      name: 'a.png',
      tags: []
    })
    render(AssetsSidebarGridView, {
      props: {
        assets: [img, videoAsset],
        isSelected: () => false,
        showOutputCount: () => false,
        getOutputCount: () => 0,
        gridMode: MEDIA_ASSET_GRID_MODE.grid,
        groupedAssets: [
          { key: 'image', items: [img] },
          { key: 'video', items: [videoAsset] }
        ],
        collapsedGroups: new Set(['image'])
      },
      global: {
        stubs: {
          VirtualGrid: VirtualGridStub,
          MediaAssetCard: MediaAssetCardStub
        }
      }
    })

    // Both headers render; only the expanded group contributes a card.
    expect(screen.getAllByText(/^(image|video)$/)).toHaveLength(2)
    expect(screen.getAllByTestId('media-asset-card')).toHaveLength(1)
  })

  it('emits toggle-group from the grid header', async () => {
    const user = userEvent.setup()
    const img: AssetItem = fromPartial({
      id: 'img-asset',
      name: 'a.png',
      tags: []
    })
    const { emitted } = render(AssetsSidebarGridView, {
      props: {
        assets: [img],
        isSelected: () => false,
        showOutputCount: () => false,
        getOutputCount: () => 0,
        gridMode: MEDIA_ASSET_GRID_MODE.grid,
        groupedAssets: [{ key: 'image', items: [img] }]
      },
      global: {
        stubs: {
          VirtualGrid: VirtualGridStub,
          MediaAssetCard: MediaAssetCardStub
        }
      }
    })

    await user.click(screen.getByText('image'))

    expect(emitted('toggle-group')).toEqual([['image']])
  })
})
