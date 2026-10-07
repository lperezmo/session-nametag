import { describe, expect, test, tier } from 'claude-code/testing'

import {
  asConfig,
  assign,
  baseName,
  COLORS,
  folderKey,
  isAlive,
  modelLabel,
  mustYield,
  ordinal,
  parseArgs,
  pickColor,
  pickNumber,
  PRESETS,
  render,
  STALE_MS,
  type LiveEntry,
  type TagValues,
} from '../hooks/tag'

tier('user')

// Wed Oct 7th, 2026 9:05 am in local time, whatever the machine's zone.
const START = new Date(2026, 9, 7, 9, 5).getTime()

const V: TagValues = {
  model: 'Opus 5.5',
  folder: 'hess-laundry',
  dir: 'hess-laundry',
  branch: 'fix/backfill',
  n: 2,
  host: 'LUIS-DESKTOP',
  user: 'luis',
  startedAt: START,
}

function live(id: string, key: string, n: number, color: string | null = null): LiveEntry {
  return { id, key, n, color, at: 0, title: null, isManual: false }
}

describe('render', () => {
  test('the presets from compact to full', () => {
    expect(render(PRESETS.compact, V)).toBe('hess-laundry #2')
    expect(render(PRESETS.branch, V)).toBe('hess-laundry/fix/backfill #2')
    expect(render(PRESETS.host, V)).toBe('hess-laundry/fix/backfill #2 @ LUIS-DESKTOP')
    expect(render(PRESETS.model, V)).toBe('[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP')
    expect(render(PRESETS.timed, V)).toBe('[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP Wed 9:05 am')
    expect(render(PRESETS.full, V)).toBe('[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am')
  })

  test('a group with an empty token disappears', () => {
    expect(render(PRESETS.full, { ...V, n: 1, branch: '' })).toBe('[Opus 5.5] hess-laundry @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am')
  })

  test('num always shows, n hides the first instance', () => {
    expect(render('{folder} #{num}', { ...V, n: 1 })).toBe('hess-laundry #1')
    expect(render('{folder}{ #n}', { ...V, n: 1 })).toBe('hess-laundry')
  })

  test('text outside groups and groups without tokens are kept', () => {
    expect(render('work: {folder} {hello}', V)).toBe('work: hess-laundry {hello}')
  })

  test('token names inside words are not tokens', () => {
    expect(render('{in folder}', V)).toBe('in hess-laundry')
  })

  test('very long titles are cut', () => {
    expect(render('{folder}', { ...V, folder: 'x'.repeat(300) }).length).toBe(120)
  })
})

describe('labels', () => {
  test('model ids read as people say them', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-sonnet-4-5-20250929[1m]')).toBe('Sonnet 4.5')
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelLabel('opus')).toBe('Opus')
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })

  test('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
  })

  test('paths', () => {
    expect(baseName('D:\\Python\\hess-laundry')).toBe('hess-laundry')
    expect(baseName('/home/luis/app/')).toBe('app')
    expect(baseName('D:\\')).toBe('D:')
    expect(folderKey('D:\\Python\\Hess-Laundry\\')).toBe('d:/python/hess-laundry')
  })
})

describe('picking', () => {
  test('a folder keeps its color and moves on when it is taken', () => {
    const own = pickColor('d:/python/a', [])

    expect(pickColor('d:/python/a', [])).toBe(own)
    expect(pickColor('d:/python/a', [own])).not.toBe(own)
    expect(pickColor('d:/python/a', [...COLORS])).toBe(own)
  })

  test('the lowest free number', () => {
    expect(pickNumber([])).toBe(1)
    expect(pickNumber([1, 2, 4])).toBe(3)
  })

  test('numbers count per folder, colors across all sessions', () => {
    const others = [live('a', 'x', 1, 'red'), live('b', 'y', 1, 'blue')]

    expect(assign('x', others, 'auto').n).toBe(2)
    expect(assign('z', others, 'auto').n).toBe(1)
    expect(['red', 'blue']).not.toContain(assign('z', others, 'auto').color)
    expect(assign('z', others, 'off').color).toBe(null)
    expect(assign('z', others, 'green').color).toBe('green')
  })

  test('on a tie the earlier id keeps the number', () => {
    expect(mustYield(live('b', 'x', 1), [live('a', 'x', 1)])).toBe(true)
    expect(mustYield(live('a', 'x', 1), [live('b', 'x', 1)])).toBe(false)
    expect(mustYield(live('b', 'x', 1), [live('a', 'y', 1)])).toBe(false)
  })

  test('stale entries are dead', () => {
    expect(isAlive(live('a', 'x', 1), STALE_MS - 1)).toBe(true)
    expect(isAlive(live('a', 'x', 1), STALE_MS)).toBe(false)
  })
})

describe('config', () => {
  test('defaults fill what is missing', () => {
    expect(asConfig(undefined)).toEqual({ template: 'full', color: 'auto', isOn: true, offFolders: [] })
    expect(asConfig({ template: 'compact', isOn: false }).template).toBe('compact')
  })
})

describe('parseArgs', () => {
  test('bare shows, help helps', () => {
    expect(parseArgs('')).toEqual({ kind: 'show' })
    expect(parseArgs('help')).toEqual({ kind: 'help' })
  })

  test('presets and templates', () => {
    expect(parseArgs('Compact')).toEqual({ kind: 'preset', name: 'compact' })
    expect(parseArgs('template {folder}{/branch}')).toEqual({ kind: 'template', template: '{folder}{/branch}' })
    expect(parseArgs('{folder} #{num}')).toEqual({ kind: 'template', template: '{folder} #{num}' })
    expect(parseArgs('presets')).toEqual({ kind: 'presets' })
  })

  test('force, color, off and on', () => {
    expect(parseArgs('force')).toEqual({ kind: 'apply' })
    expect(parseArgs('color Pink')).toEqual({ kind: 'color', color: 'pink' })
    expect(parseArgs('color teal').kind).toBe('error')
    expect(parseArgs('off here')).toEqual({ kind: 'power', isOn: false, isHere: true })
    expect(parseArgs('on')).toEqual({ kind: 'power', isOn: true, isHere: false })
    expect(parseArgs('bogus').kind).toBe('error')
  })
})
