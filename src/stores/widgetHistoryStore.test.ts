import { describe, expect, it } from 'vitest'

import { toNodeId } from '@/types/nodeId'
import { widgetId } from '@/types/widgetId'

import {
  WIDGET_HISTORY_LIMIT,
  ownsNodeHistory,
  useWidgetHistoryStore
} from './widgetHistoryStore'

function scopeOf(rootGraphId: string, nodeId = 1, name = 'bboxes') {
  return {
    rootGraphId,
    widgetId: widgetId(rootGraphId, toNodeId(nodeId), name)
  }
}

const scope = scopeOf('root-a')

describe(ownsNodeHistory, () => {
  it.for([
    { type: 'boundingboxes', owns: true },
    { type: 'number', owns: false },
    { type: undefined, owns: false }
  ])('returns $owns for widget type $type', ({ type, owns }) => {
    expect(ownsNodeHistory({ type })).toBe(owns)
  })
})

describe(useWidgetHistoryStore, () => {
  it('undoes to the recorded value and redoes back to the current one', () => {
    const store = useWidgetHistoryStore()
    store.record(scope, 'before')

    expect(store.undo(scope, 'after')).toEqual({ value: 'before' })
    expect(store.canUndo(scope)).toBe(false)
    expect(store.redo(scope, 'before')).toEqual({ value: 'after' })
    expect(store.canRedo(scope)).toBe(false)
    expect(store.canUndo(scope)).toBe(true)
  })

  it.for(['undo', 'redo'] as const)(
    'returns nothing to %s for an untouched widget',
    (direction) => {
      expect(useWidgetHistoryStore()[direction](scope, 'value')).toBeUndefined()
    }
  )

  it('keeps only the latest steps', () => {
    const store = useWidgetHistoryStore()
    for (let step = 0; step < WIDGET_HISTORY_LIMIT + 2; step++) {
      store.record(scope, step)
    }

    const undone = []
    for (let step = store.undo(scope, 'now'); step;) {
      undone.push(step.value)
      step = store.undo(scope, step.value)
    }

    expect(undone).toHaveLength(WIDGET_HISTORY_LIMIT)
    expect(undone.at(-1)).toBe(2)
  })

  it.for([
    { case: 'the same key', keys: ['text:0', 'text:0'], steps: 1 },
    { case: 'different keys', keys: ['text:0', 'text:1'], steps: 2 },
    { case: 'no key', keys: [undefined, undefined], steps: 2 }
  ])('records $steps step(s) for edits with $case', ({ keys, steps }) => {
    const store = useWidgetHistoryStore()
    keys.forEach((key, index) => store.record(scope, index, key))

    let count = 0
    while (store.undo(scope, 'now')) count++

    expect(count).toBe(steps)
  })

  it('does not merge into a step that was undone', () => {
    const store = useWidgetHistoryStore()
    store.record(scope, 'a', 'text:0')
    store.undo(scope, 'b')
    store.record(scope, 'a', 'text:0')
    store.record(scope, 'c', 'text:0')

    expect(store.undo(scope, 'd')).toEqual({ value: 'a' })
    expect(store.canUndo(scope)).toBe(false)
  })

  it('drops the redo branch when a new step is recorded', () => {
    const store = useWidgetHistoryStore()
    store.record(scope, 'a')
    store.undo(scope, 'b')
    store.record(scope, 'a')

    expect(store.canRedo(scope)).toBe(false)
  })

  it('keeps stored values isolated from later mutation', () => {
    const store = useWidgetHistoryStore()
    const recorded = [{ x: 1 }]
    store.record(scope, recorded)
    recorded[0].x = 99

    const step = store.undo(scope, [])
    expect(step?.value).toEqual([{ x: 1 }])
  })

  it('keeps separate histories per widget and per workflow', () => {
    const store = useWidgetHistoryStore()
    store.record(scope, 'a')

    expect(store.canUndo(scopeOf('root-a', 2))).toBe(false)
    expect(store.canUndo(scopeOf('root-a', 1, 'other'))).toBe(false)
    expect(store.canUndo(scopeOf('root-b'))).toBe(false)
  })

  it('forgets histories of widgets that are no longer live in that workflow', () => {
    const store = useWidgetHistoryStore()
    const kept = scopeOf('root-a', 1)
    const removed = scopeOf('root-a', 2)
    const otherWorkflow = scopeOf('root-b', 2)
    for (const target of [kept, removed, otherWorkflow]) {
      store.record(target, 'a')
    }

    store.retainLive('root-a', new Set([kept.widgetId]))

    expect(store.canUndo(kept)).toBe(true)
    expect(store.canUndo(removed)).toBe(false)
    expect(store.canUndo(otherWorkflow)).toBe(true)
  })

  it('forgets a workflow once none of its widgets are live', () => {
    const store = useWidgetHistoryStore()
    store.record(scope, 'a')

    store.retainLive('root-a', new Set())
    store.record(scopeOf('root-a', 3), 'b')

    expect(store.canUndo(scope)).toBe(false)
    expect(store.canUndo(scopeOf('root-a', 3))).toBe(true)
  })

  it('clears every history of one workflow', () => {
    const store = useWidgetHistoryStore()
    const closed = scopeOf('root-a')
    const open = scopeOf('root-b')
    store.record(closed, 'a')
    store.record(open, 'a')

    store.clearWorkflow('root-a')

    expect(store.canUndo(closed)).toBe(false)
    expect(store.canUndo(open)).toBe(true)
  })
})
