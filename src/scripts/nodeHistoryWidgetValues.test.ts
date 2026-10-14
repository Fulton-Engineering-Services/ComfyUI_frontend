import { beforeEach, describe, expect, it } from 'vitest'

import { LGraphNode } from '@/lib/litegraph/src/litegraph'
import type { LGraph, Subgraph } from '@/lib/litegraph/src/litegraph'
import {
  createTestRootGraph,
  createTestSubgraphData,
  createTestSubgraphNode,
  resetSubgraphFixtureState
} from '@/lib/litegraph/src/subgraph/__fixtures__/subgraphHelpers'
import { parseFlattenableSubgraphDefinitions } from '@/platform/workflow/core/utils/workflowFlattening'
import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'
import { validateComfyWorkflow } from '@/platform/workflow/validation/schemas/workflowSchema'
import { toNodeId } from '@/types/nodeId'
import { widgetId } from '@/types/widgetId'

import {
  collectNodeHistoryWidgets,
  withNodeHistoryValuesFrom
} from './nodeHistoryWidgetValues'

const regionA = { x: 0, y: 0, width: 64, height: 64 }

function boundingBoxesNode(id: number) {
  const node = new LGraphNode('CreateBoundingBoxes')
  node.id = toNodeId(id)
  node.serialize_widgets = true
  node.addWidget('number', 'width', 512, null)
  node.addWidget('boundingboxes', 'bboxes', [], null)
  return node
}

function widgetOf(node: LGraphNode, name: string) {
  const widget = node.widgets?.find((w) => w.name === name)
  if (!widget) throw new Error(`missing widget ${name}`)
  return widget
}

async function snapshot(rootGraph: LGraph): Promise<ComfyWorkflowJSON> {
  const state = await validateComfyWorkflow(rootGraph.serialize(), (error) => {
    throw new Error(error)
  })
  if (!state) throw new Error('invalid workflow')
  return JSON.parse(JSON.stringify(state))
}

function interiorValues(state: ComfyWorkflowJSON, subgraph: Subgraph) {
  return parseFlattenableSubgraphDefinitions(state.definitions?.subgraphs ?? [])
    .find((candidate) => candidate.id === subgraph.id)
    ?.nodes.at(0)?.widgets_values
}

describe('node-history widget values', () => {
  let rootGraph: LGraph
  let subgraph: Subgraph
  let rootNode: LGraphNode
  let interiorNode: LGraphNode

  beforeEach(() => {
    resetSubgraphFixtureState()
    rootGraph = createTestRootGraph()
    subgraph = rootGraph.createSubgraph(createTestSubgraphData())
    rootGraph.add(createTestSubgraphNode(subgraph, { id: 100 }))
    rootNode = boundingBoxesNode(1)
    rootGraph.add(rootNode)
    interiorNode = boundingBoxesNode(2)
    subgraph.add(interiorNode)
  })

  it('collects node-history widgets from the root graph and subgraphs', () => {
    expect(collectNodeHistoryWidgets(rootGraph)).toEqual([
      widgetId(rootGraph.id, toNodeId(1), 'bboxes'),
      widgetId(subgraph.id, toNodeId(2), 'bboxes')
    ])
  })

  it.for([
    { case: 'only the boxes changed', width: 512, expected: [512, [regionA]] },
    { case: 'the node width changed too', width: 1024, expected: [512, []] }
  ])(
    'carries a subgraph interior value when $case',
    async ({ width, expected }) => {
      const target = await snapshot(rootGraph)
      widgetOf(interiorNode, 'bboxes').value = [regionA]
      widgetOf(interiorNode, 'width').value = width
      const source = await snapshot(rootGraph)

      const result = withNodeHistoryValuesFrom(
        target,
        source,
        collectNodeHistoryWidgets(rootGraph),
        rootGraph.id
      )

      expect(interiorValues(result, subgraph)).toEqual(expected)
      expect(interiorValues(target, subgraph)).toEqual([512, []])
    }
  )

  it('carries every node-history widget of a node with several', async () => {
    rootNode.addWidget('boundingboxes', 'more_bboxes', [], null)
    const target = await snapshot(rootGraph)
    widgetOf(rootNode, 'bboxes').value = [regionA]
    widgetOf(rootNode, 'more_bboxes').value = [regionA, regionA]
    const source = await snapshot(rootGraph)

    const result = withNodeHistoryValuesFrom(
      target,
      source,
      collectNodeHistoryWidgets(rootGraph),
      rootGraph.id
    )

    expect(result.nodes.find((node) => node.id === 1)?.widgets_values).toEqual([
      512,
      [regionA],
      [regionA, regionA]
    ])
  })

  it('leaves the target untouched when the node is gone from the source', async () => {
    const target = await snapshot(rootGraph)
    widgetOf(rootNode, 'bboxes').value = [regionA]
    const widgets = collectNodeHistoryWidgets(rootGraph)
    rootGraph.remove(rootNode)
    const source = await snapshot(rootGraph)

    expect(
      withNodeHistoryValuesFrom(target, source, widgets, rootGraph.id)
    ).toEqual(target)
  })
})
