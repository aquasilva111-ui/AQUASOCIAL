import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseNumber, parseTable, tableToChart } from '../src/index'

test('parseNumber: international, pt-BR, currency and percent forms', () => {
  assert.equal(parseNumber('1234.5'), 1234.5)
  assert.equal(parseNumber('1,234.5'), 1234.5)
  assert.equal(parseNumber('1.234,5'), 1234.5)
  assert.equal(parseNumber('1.234.567'), 1234567)
  assert.equal(parseNumber('3,5'), 3.5)
  assert.equal(parseNumber('1,234'), 1234) // three digits after a lone comma: thousands
  assert.equal(parseNumber('R$ 3,50'), 3.5)
  assert.equal(parseNumber('12%'), 12)
  assert.equal(parseNumber('-4'), -4)
  assert.equal(parseNumber(' 7 '), 7)
  for (const bad of ['', 'abc', '12abc', '--', 'R$', '1/2']) assert.ok(Number.isNaN(parseNumber(bad)), bad)
})

test('parseTable: delimiter detection, quotes, header detection, BOM and blank lines', () => {
  const csv = parseTable('Mês,Vendas,Custos\nJan,10,4\nFev,"1,5",3\n\nMar,7,2\n')
  assert.equal(csv.delimiter, ',')
  assert.deepEqual(csv.header, ['Mês', 'Vendas', 'Custos'])
  assert.deepEqual(csv.rows, [['Jan', '10', '4'], ['Fev', '1,5', '3'], ['Mar', '7', '2']])
  assert.equal(parseTable('a;b\n1;2\n3;4').delimiter, ';')
  assert.equal(parseTable('a\tb\n1\t2').delimiter, '\t')
  assert.deepEqual(parseTable('﻿x,y\n1,2').header, ['x', 'y'])
  assert.equal(parseTable('1,2\n3,4').header, null) // numbers only: no header
  assert.deepEqual(parseTable('say,"he said ""hi"""\n1,2').header, ['say', 'he said "hi"'].map((x) => x))
  assert.deepEqual(parseTable('').rows, [])
  assert.equal(parseTable(Array.from({ length: 900 }, (_, i) => `${i},${i}`).join('\n')).rows.length, 501) // capped
})

test('tableToChart: categories from the first column, numeric columns become series', () => {
  const c = tableToChart(parseTable('Mês;Vendas;Custos\nJan;10;4\nFev;1,5;3\nMar;7;2'))!
  assert.deepEqual(c.categories, ['Jan', 'Fev', 'Mar'])
  assert.deepEqual(c.series, [{ name: 'Vendas', values: [10, 1.5, 7] }, { name: 'Custos', values: [4, 3, 2] }])
  // a single numeric column: categories 1..n
  const one = tableToChart(parseTable('5\n8\n3'))!
  assert.deepEqual(one.categories, ['1', '2', '3'])
  assert.deepEqual(one.series[0].values, [5, 8, 3])
  // x,y numbers: the first numeric column is a label, the rest are data
  const xy = tableToChart(parseTable('x,y\n1,10\n2,20'))!
  assert.deepEqual(xy.categories, ['1', '2'])
  assert.deepEqual(xy.series, [{ name: 'y', values: [10, 20] }])
  // text-only tables and empty input are not charts; a text column mixed in is skipped
  assert.equal(tableToChart(parseTable('a,b\nx,y\nz,w')), null)
  assert.equal(tableToChart(parseTable('')), null)
  const mixed = tableToChart(parseTable('nome,nota,obs\nAna,9,ok\nBia,7,bom'))!
  assert.deepEqual(mixed.series.map((s) => s.name), ['nota'])
  // unparseable cells in a numeric column count as 0, not NaN
  assert.deepEqual(tableToChart(parseTable('k,v\na,1\nb,\nc,3'))!.series[0].values, [1, 0, 3])
})
