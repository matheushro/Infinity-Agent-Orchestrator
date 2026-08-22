// Regression guard for "Cannot set property editable of #<WidgetType> which has
// only a getter": `WidgetType` exposes internal accessors (`editable`,
// `isHidden`, `estimatedHeight`, …) as getter-only properties on its prototype,
// so any widget field sharing one of those names throws on construction under a
// transpiler that emits plain assignments for constructor parameter properties.
import { describe, expect, it } from 'vitest'
import { WidgetType } from '@codemirror/view'
import { TableWidget } from './tableWidget'
import { BulletWidget, CheckboxWidget, ImageWidget, RuleWidget } from './widgets'

const getterOnlyNames = (): string[] => {
  const names: string[] = []
  for (let proto = WidgetType.prototype; proto; proto = Object.getPrototypeOf(proto)) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (descriptor.get && !descriptor.set) names.push(name)
    }
  }
  return names
}

describe('live-preview widgets', () => {
  const widgets: Array<[string, WidgetType]> = [
    ['TableWidget', new TableWidget('| a | b |\n| - | - |\n| 1 | 2 |', 0, true)],
    ['CheckboxWidget', new CheckboxWidget(true, 0, 3)],
    ['BulletWidget', new BulletWidget()],
    ['RuleWidget', new RuleWidget()],
    ['ImageWidget', new ImageWidget('a.png', 'a')],
  ]

  it.each(widgets)('%s shadows no getter-only member of WidgetType', (_name, widget) => {
    const shadowed = getterOnlyNames().filter((name) =>
      Object.prototype.hasOwnProperty.call(widget, name),
    )

    expect(shadowed).toEqual([])
  })

  it('keeps the table cells-editable flag out of the eq() blind spot', () => {
    const source = '| a | b |\n| - | - |\n| 1 | 2 |'

    expect(new TableWidget(source, 0, true).eq(new TableWidget(source, 0, true))).toBe(true)
    expect(new TableWidget(source, 0, true).eq(new TableWidget(source, 0, false))).toBe(false)
  })
})
