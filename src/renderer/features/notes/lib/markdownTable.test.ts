import { describe, expect, it } from 'vitest'
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseMarkdownTable,
  serializeMarkdownTable,
  setCell,
  setColumnAlign,
  type MarkdownTable,
} from './markdownTable'

const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |'

/** Parse or fail loudly — every test here starts from a valid table. */
function parse(source: string): MarkdownTable {
  const table = parseMarkdownTable(source)
  if (!table) throw new Error(`not a table: ${source}`)
  return table
}

describe('parseMarkdownTable', () => {
  it('reads the header, the body and the column alignments', () => {
    const table = parse('| Name | Qty | Price |\n| :--- | :-: | ----: |\n| Nut | 3 | 0.10 |')

    expect(table.rows).toEqual([
      ['Name', 'Qty', 'Price'],
      ['Nut', '3', '0.10'],
    ])
    expect(table.aligns).toEqual(['left', 'center', 'right'])
  })

  it('accepts tables without outer pipes and pads short rows', () => {
    const table = parse('a | b\n--- | ---\n1')

    expect(table.rows).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('unescapes pipes inside a cell', () => {
    expect(parse('| a \\| b |\n| --- |').rows[0]).toEqual(['a | b'])
  })

  it('rejects anything that is not a pipe table', () => {
    expect(parseMarkdownTable('| a | b |')).toBeNull()
    expect(parseMarkdownTable('| a | b |\n| x | y |')).toBeNull()
    expect(parseMarkdownTable('| a | b |\n| --- |')).toBeNull()
  })
})

describe('serializeMarkdownTable', () => {
  it('pads every column so the raw Markdown stays aligned', () => {
    const table = parse('| Name | Qty |\n| --- | --- |\n| Longer value | 3 |')

    expect(serializeMarkdownTable(table)).toBe(
      '| Name         | Qty |\n| ------------ | --- |\n| Longer value | 3   |',
    )
  })

  it('keeps the alignment markers', () => {
    const table = parse('| a | b | c |\n| :-- | :-: | --: |')

    expect(serializeMarkdownTable(table)).toBe('| a   | b   | c   |\n| :-- | :-: | --: |')
  })

  it('escapes pipes and flattens line breaks a cell may have collected', () => {
    const table = setCell(parse(TABLE), 1, 0, 'x | y\nz')

    expect(serializeMarkdownTable(table)).toContain('| x \\| y z |')
  })

  it('normalises once and is then stable', () => {
    const normalised = serializeMarkdownTable(parse(TABLE))

    expect(normalised).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |')
    expect(serializeMarkdownTable(parse(normalised))).toBe(normalised)
  })
})

describe('structural edits', () => {
  it('sets a single cell and leaves the rest alone', () => {
    const table = setCell(parse(TABLE), 1, 1, 'nine')

    expect(table.rows).toEqual([
      ['a', 'b'],
      ['1', 'nine'],
    ])
  })

  it('inserts a row without ever displacing the header', () => {
    expect(insertRow(parse(TABLE), 1).rows).toEqual([
      ['a', 'b'],
      ['', ''],
      ['1', '2'],
    ])
    expect(insertRow(parse(TABLE), 0).rows[0]).toEqual(['a', 'b'])
  })

  it('deletes a body row but never the header', () => {
    expect(deleteRow(parse(TABLE), 1).rows).toEqual([['a', 'b']])
    expect(deleteRow(parse(TABLE), 0).rows).toHaveLength(2)
  })

  it('inserts a column with its own alignment slot', () => {
    const table = insertColumn(parse(TABLE), 1)

    expect(table.rows).toEqual([
      ['a', '', 'b'],
      ['1', '', '2'],
    ])
    expect(table.aligns).toEqual(['none', 'none', 'none'])
  })

  it('deletes a column, keeping the last one', () => {
    const table = deleteColumn(parse(TABLE), 0)

    expect(table.rows).toEqual([['b'], ['2']])
    expect(deleteColumn(table, 0)).toEqual(table)
  })

  it('changes one column alignment', () => {
    expect(setColumnAlign(parse(TABLE), 1, 'center').aligns).toEqual(['none', 'center'])
  })
})
