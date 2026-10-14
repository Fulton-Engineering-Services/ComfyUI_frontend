import { cloneDeep, groupBy, isEqual, omit } from 'es-toolkit'

import type { LGraph } from '@/lib/litegraph/src/litegraph'
import {
  collectSubgraphDefinitions,
  parseFlattenableSubgraphDefinitions
} from '@/platform/workflow/core/utils/workflowFlattening'
import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'
import { ownsNodeHistory } from '@/stores/widgetHistoryStore'
import { parseWidgetId, widgetId } from '@/types/widgetId'
import type { WidgetId } from '@/types/widgetId'

interface SerializedWidgetValues {
  id?: unknown
  widgets_values?: unknown
  widgets_values_named?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function collectNodeHistoryWidgets(rootGraph: LGraph): WidgetId[] {
  return [rootGraph, ...rootGraph.subgraphs.values()].flatMap((graph) =>
    graph.nodes.flatMap((node) =>
      (node.widgets ?? [])
        .filter((widget) => widget.serialize !== false)
        .filter(ownsNodeHistory)
        .map((widget) => widgetId(graph.id, node.id, widget.name))
    )
  )
}

function nodeKey(graphId: string, nodeId: unknown): string {
  return `${graphId}:${String(nodeId)}`
}

function serializedNodes(
  state: ComfyWorkflowJSON,
  rootGraphId: string
): Map<string, SerializedWidgetValues> {
  const subgraphs = collectSubgraphDefinitions(
    parseFlattenableSubgraphDefinitions(state.definitions?.subgraphs ?? [])
  )
  const graphs: [string, readonly SerializedWidgetValues[]][] = [
    [rootGraphId, state.nodes],
    ...subgraphs.map(
      (subgraph): [string, readonly SerializedWidgetValues[]] => [
        subgraph.id,
        subgraph.nodes
      ]
    )
  ]
  return new Map(
    graphs.flatMap(([graphId, nodes]) =>
      nodes.map((node): [string, SerializedWidgetValues] => [
        nodeKey(graphId, node.id),
        node
      ])
    )
  )
}

function namedValues(
  node: SerializedWidgetValues
): Record<string, unknown> | undefined {
  return isRecord(node.widgets_values_named)
    ? node.widgets_values_named
    : undefined
}

function writeWidgetValue(
  node: SerializedWidgetValues,
  name: string,
  value: unknown
): void {
  const named = namedValues(node)
  if (!named || !(name in named)) return
  const index = Object.keys(named).indexOf(name)
  named[name] = cloneDeep(value)
  if (Array.isArray(node.widgets_values) && index < node.widgets_values.length)
    node.widgets_values[index] = cloneDeep(value)
}

export function withNodeHistoryValuesFrom(
  target: ComfyWorkflowJSON,
  source: ComfyWorkflowJSON,
  widgets: readonly WidgetId[],
  rootGraphId: string
): ComfyWorkflowJSON {
  if (!widgets.length) return target
  const result = cloneDeep(target)
  const targetNodes = serializedNodes(result, rootGraphId)
  const sourceNodes = serializedNodes(source, rootGraphId)
  const ownedByNode = groupBy(
    widgets.map(parseWidgetId),
    ({ graphId, nodeId }) => nodeKey(graphId, nodeId)
  )

  for (const [key, nodeWidgets] of Object.entries(ownedByNode)) {
    const targetNode = targetNodes.get(key)
    const sourceNode = sourceNodes.get(key)
    const sourceValues = sourceNode && namedValues(sourceNode)
    if (!targetNode || !sourceNode || !sourceValues) continue

    const owned = nodeWidgets.map(({ name }) => name)
    if (
      !isEqual(
        omit(namedValues(targetNode) ?? {}, owned),
        omit(sourceValues, owned)
      )
    ) {
      continue
    }
    for (const name of owned) {
      if (name in sourceValues)
        writeWidgetValue(targetNode, name, sourceValues[name])
    }
  }
  return result
}
