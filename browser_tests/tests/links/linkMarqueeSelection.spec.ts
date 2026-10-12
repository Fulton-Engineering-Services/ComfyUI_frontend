import type { Page } from '@playwright/test'

import type { Point } from '@/lib/litegraph/src/interfaces'

import {
  comfyExpect as expect,
  comfyPageFixture as test
} from '@e2e/fixtures/ComfyPage'
import type { ComfyPage } from '@e2e/fixtures/ComfyPage'
import { TestIds } from '@e2e/fixtures/selectors'

const CONDITIONING_INPUTS = ['positive', 'negative']

async function conditioningLinks(page: Page) {
  const handle = await page.waitForFunction((inputNames) => {
    const app = window.app!
    const sampler = app.graph.nodes.find((node) => node.type === 'KSampler')
    if (!sampler) return null
    const links = inputNames.map((name) => {
      const input = sampler.inputs.find((slot) => slot.name === name)
      const link = input?.link != null ? app.graph.getLink(input.link) : null
      if (!link?.path) return null
      return { id: link.id, center: app.canvasPosToClientPos(link._pos) }
    })
    return links.every((link) => link !== null) ? links : null
  }, CONDITIONING_INPUTS)
  const links = await handle.jsonValue()
  if (!links) throw new Error('Rendered conditioning links were not found')
  return links.map((link) => ({ id: String(link.id), center: link.center }))
}

async function marqueeAcross(comfyPage: ComfyPage, centers: Point[]) {
  const midX = centers.reduce((sum, [x]) => sum + x, 0) / centers.length
  const ys = centers.map(([, y]) => y)
  await comfyPage.canvasOps.dragAndDrop(
    { x: midX - 20, y: Math.min(...ys) - 40 },
    { x: midX + 20, y: Math.max(...ys) + 40 }
  )
}

async function moveSamplerAway(comfyPage: ComfyPage) {
  await comfyPage.page.evaluate(() => {
    const app = window.app!
    const sampler = app.graph.nodes.find((node) => node.type === 'KSampler')
    if (!sampler) throw new Error('KSampler not found')
    sampler.pos = [sampler.pos[0] + 400, sampler.pos[1]]
    app.canvas.setDirty(true, true)
  })
  await comfyPage.nextFrame()
}

async function linksStillInGraph(page: Page, linkIds: string[]) {
  const present = await page.evaluate(() =>
    [...window.app!.graph.links.keys()].map((id) => String(id))
  )
  return linkIds.filter((id) => present.includes(id))
}

test.describe('Marquee link selection', { tag: '@canvas' }, () => {
  test.use({
    initialSettings: {
      'Comfy.Canvas.SelectionToolbox': true,
      'Comfy.Canvas.NavigationMode': 'standard'
    }
  })

  test.beforeEach(async ({ comfyPage }) => {
    await comfyPage.workflow.loadWorkflow('default')
    await moveSamplerAway(comfyPage)
  })

  test('hides, then deletes, the links under an empty marquee', async ({
    comfyPage
  }) => {
    const links = await conditioningLinks(comfyPage.page)
    const linkIds = links.map((link) => link.id)
    const centers = links.map((link) => link.center)

    await test.step('Hide both links from the toolbox', async () => {
      await marqueeAcross(comfyPage, centers)
      await comfyPage.selectionToolbox
        .getByTestId(TestIds.selectionToolbox.hideLinks)
        .click()

      await expect
        .poll(
          async () =>
            (await comfyPage.workflow.getExportedWorkflow()).extra
              ?.linkPresentation
        )
        .toMatchObject(
          Object.fromEntries(linkIds.map((id) => [id, { hidden: true }]))
        )
      await expect(comfyPage.selectionToolbox).toBeHidden()
    })

    await test.step('Show the links again with undo', async () => {
      await comfyPage.keyboard.undo()
      await expect
        .poll(
          async () =>
            (await comfyPage.workflow.getExportedWorkflow()).extra
              ?.linkPresentation ?? {}
        )
        .toEqual({})
    })

    await test.step('Delete both links from the toolbox', async () => {
      await marqueeAcross(comfyPage, centers)
      await comfyPage.selectionToolbox
        .getByTestId(TestIds.selectionToolbox.deleteLinks)
        .click()

      await expect
        .poll(() => linksStillInGraph(comfyPage.page, linkIds))
        .toEqual([])
    })

    await test.step('Restore both links with one undo', async () => {
      await comfyPage.keyboard.undo()
      await expect
        .poll(() => linksStillInGraph(comfyPage.page, linkIds))
        .toEqual(linkIds)
    })
  })

  test('deletes selected links with the Delete key', async ({ comfyPage }) => {
    const links = await conditioningLinks(comfyPage.page)
    const linkIds = links.map((link) => link.id)

    await marqueeAcross(
      comfyPage,
      links.map((link) => link.center)
    )
    await expect(
      comfyPage.selectionToolbox.getByTestId(
        TestIds.selectionToolbox.deleteLinks
      )
    ).toBeVisible()
    await comfyPage.page.keyboard.press('Delete')

    await expect
      .poll(() => linksStillInGraph(comfyPage.page, linkIds))
      .toEqual([])
  })
})

test.describe('Socket click link selection', { tag: '@canvas' }, () => {
  test.use({ initialSettings: { 'Comfy.Canvas.SelectionToolbox': true } })

  test.beforeEach(async ({ comfyPage }) => {
    await comfyPage.workflow.loadWorkflow('default')
  })

  test('clicking an output hides its links, and dragging it still connects', async ({
    comfyPage
  }) => {
    const [loader] = await comfyPage.nodeOps.getNodeRefsByType(
      'CheckpointLoaderSimple'
    )
    const [encoder] =
      await comfyPage.nodeOps.getNodeRefsByType('CLIPTextEncode')
    const clipOutput = await loader.getOutput(1)
    const encoderInput = await encoder.getInput(0)
    const inputLinkId = () =>
      comfyPage.page.evaluate(
        (id) => window.app!.graph.getNodeById(id)?.inputs[0].link ?? null,
        encoder.id
      )
    const clipLinkIds = await comfyPage.page.evaluate(
      (id) =>
        (window.app!.graph.getNodeById(id)?.outputs[1].links ?? []).map(String),
      loader.id
    )
    expect(clipLinkIds).toHaveLength(2)

    await test.step('Hide both links from the toolbox', async () => {
      const position = await clipOutput.getPosition()
      await comfyPage.page.mouse.click(position.x, position.y)
      await comfyPage.selectionToolbox
        .getByTestId(TestIds.selectionToolbox.hideLinks)
        .click()

      await expect
        .poll(
          async () =>
            (await comfyPage.workflow.getExportedWorkflow()).extra
              ?.linkPresentation
        )
        .toMatchObject(
          Object.fromEntries(clipLinkIds.map((id) => [id, { hidden: true }]))
        )
    })

    await test.step('Drag from the same output to reconnect an input', async () => {
      const previousLinkId = await inputLinkId()
      await comfyPage.canvasOps.dragAndDrop(
        await clipOutput.getPosition(),
        await encoderInput.getPosition()
      )

      await expect.poll(inputLinkId).not.toBe(previousLinkId)
      await expect.poll(() => clipOutput.getLinkCount()).toBe(2)
    })
  })
})
