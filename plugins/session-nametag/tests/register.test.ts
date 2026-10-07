import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CONFIG_KEY, LIVE_PREFIX, SEEN_PREFIX, STALE_MS } from '../hooks/tag'

tier('user')

// Wed Oct 7th, 2026 9:05 am local; the clock starts here too.
const START = new Date(2026, 9, 7, 9, 5).getTime()
const ROOT = 'D:\\Python\\hess-laundry'
const KEY = 'd:/python/hess-laundry'
const FULL = '[Opus 5.5] hess-laundry/fix/backfill @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am'
const INTERACTIVE = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const TYPED = { kind: 'composer' }

type World = {
  /** The mod's store, for the test to read. */
  store: Map<string, unknown>
  /** Every command the mod ran (/color, /rename), as `name args`. */
  ran: string[]
  /** What the fake session answers; a test changes it between calls. */
  session: { branch: string; turns: number; model: string; id: string }
  clock: ReturnType<typeof mock.clock>
}

/**
 * A session in hess-laundry on LUIS-DESKTOP, on Opus 5.5, in git on
 * fix/backfill, with a terminal at the prompt.
 */
function world(on: On, opts: { stored?: Record<string, unknown>; env?: Record<string, string>; turns?: number } = {}): World {
  const ran: string[] = []
  const session = { branch: 'fix/backfill', turns: opts.turns ?? 0, model: 'claude-opus-5-5', id: 'sess-b' }
  const store = new Map<string, unknown>(Object.entries(opts.stored ?? {}))

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: session.id }))
  on('session.root', () => ({ value: ROOT }))
  on('session.repo', () => ({ value: { root: ROOT, remote: null, internal: false, name: null } }))
  on('session.model', () => ({ value: session.model }))
  on('session.turns', () => ({ value: session.turns }))
  on('session.usage', () => ({ value: { startedAt: START } as never }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv.includes('--show-current') ? `${session.branch}\n` : 'abc1234\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never,
  }))
  on('command.run', ($, e) => {
    ran.push(`${e.command} ${e.args}`)

    return { text: '' }
  })
  on('turn.complete', () => ({ text: '' }))
  on('ui.log', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  mock.env(on, { COMPUTERNAME: 'LUIS-DESKTOP', USERNAME: 'luis', ...opts.env })

  return { store, ran, session, clock: mock.clock(on, { now: START }) }
}

/** Starts the session and lets the delayed tag run. */
async function start($: Engine, w: World) {
  await $.session.start(INTERACTIVE)
  await w.clock.advance(2000)
}

describe('session start', () => {
  test('a fresh session is renamed from the full preset and given its folder color', async ($, on) => {
    const w = world(on)

    await start($, w)

    expect(w.ran[0]).toBe(`rename ${FULL}`)
    expect(w.ran[1]).toMatch(/^color (red|blue|green|yellow|purple|orange|pink|cyan)$/)
    expect((w.store.get(`${LIVE_PREFIX}sess-b`) as { n: number }).n).toBe(1)
  })

  test('a second session in the folder is #2 with another color', async ($, on) => {
    const w = world(on, { stored: { [`${LIVE_PREFIX}sess-a`]: { id: 'sess-a', key: KEY, n: 1, color: 'red', at: START, title: 'x', isManual: false } } })

    await start($, w)

    expect(w.ran[0]).toContain('hess-laundry/fix/backfill #2 @')
    expect(w.ran[1]).not.toBe('color red')
  })

  test('a crashed session\'s entry is dropped and its number reused', async ($, on) => {
    const w = world(on, { stored: { [`${LIVE_PREFIX}sess-a`]: { id: 'sess-a', key: KEY, n: 1, color: 'red', at: START - STALE_MS - 1, title: 'x', isManual: false } } })

    await start($, w)

    expect(w.ran[0]).toBe(`rename ${FULL}`)
    expect(w.store.has(`${LIVE_PREFIX}sess-a`)).toBe(false)
  })

  test('NAMETAG_OFF leaves the session alone', async ($, on) => {
    const w = world(on, { env: { NAMETAG_OFF: '1' } })

    await start($, w)

    expect(w.ran).toEqual([])
  })

  test('a folder switched off is left alone', async ($, on) => {
    const w = world(on, { stored: { [CONFIG_KEY]: { template: 'full', color: 'auto', isOn: true, offFolders: [KEY] } } })

    await start($, w)

    expect(w.ran).toEqual([])
  })

  test('a running session the mod never tagged is left alone until /nametag force', async ($, on) => {
    const w = world(on, { turns: 4 })

    await start($, w)
    expect(w.ran).toEqual([])

    await $.command.run({ command: 'nametag', args: 'force', origin: TYPED } as never)
    await w.clock.advance(1000)
    expect(w.ran[0]).toBe(`rename ${FULL}`)
    expect(w.ran[1]).toMatch(/^color /)
  })

  test('a relaunched session gets its number and color back and keeps updating', async ($, on) => {
    const old = FULL.replace('hess-laundry/fix/backfill', 'hess-laundry/fix/backfill #2')
    const w = world(on, { turns: 4, stored: { [`${SEEN_PREFIX}sess-b`]: { id: 'sess-b', n: 2, color: 'pink', title: old, isManual: false, at: START } } })

    await start($, w)

    expect(w.ran).toEqual(['color pink'])

    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await w.clock.advance(1000)

    expect(w.ran).toContain(`rename ${old.replace('fix/backfill', 'main')}`)
  })

  test('a relaunched session renamed by hand stays as it is', async ($, on) => {
    const w = world(on, { turns: 4, stored: { [`${SEEN_PREFIX}sess-b`]: { id: 'sess-b', n: 1, color: 'pink', title: 'mine', isManual: true, at: START } } })

    await start($, w)
    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await w.clock.advance(1000)

    expect(w.ran.some((r) => r.startsWith('rename'))).toBe(false)
  })
})

describe('after the start', () => {
  test('a branch switch renames after the turn, and only then', async ($, on) => {
    const w = world(on)

    await start($, w)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await w.clock.advance(1000)
    expect(w.ran.filter((r) => r.startsWith('rename')).length).toBe(1)

    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as never)
    await w.clock.advance(1000)

    expect(w.ran).toContain(`rename ${FULL.replace('fix/backfill', 'main')}`)
  })

  test('a rename keeps the start date and moves the updated time', async ($, on) => {
    const w = world(on, { stored: { [CONFIG_KEY]: { template: '{folder}{/branch} {datetime}{ · updated}', color: 'off', isOn: true, offFolders: [] } } })

    await start($, w)
    expect(w.ran[0]).toBe('rename hess-laundry/fix/backfill Wed Oct 7th, 2026 9:05 am · 9:05 am')

    await w.clock.advance(2 * 3600_000)
    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await w.clock.advance(1000)

    expect(w.ran[w.ran.length - 1]).toBe('rename hess-laundry/main Wed Oct 7th, 2026 9:05 am · 11:05 am')
  })

  test('a subagent\'s turn does not rename', async ($, on) => {
    const w = world(on)

    await start($, w)
    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
    await w.clock.advance(1000)

    expect(w.ran.filter((r) => r.startsWith('rename')).length).toBe(1)
  })

  test('a manual /rename stops the updates', async ($, on) => {
    const w = world(on)

    await start($, w)
    await $.command.run({ command: 'rename', args: 'mine', origin: TYPED } as never)
    w.session.branch = 'main'
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await w.clock.advance(1000)

    expect(w.ran.filter((r) => r.startsWith('rename')).length).toBe(2)
    expect(w.ran[w.ran.length - 1]).toBe('rename mine')
  })

  test('/model renames with the new model', async ($, on) => {
    const w = world(on)

    await start($, w)
    w.session.model = 'claude-fable-5-1'
    await $.command.run({ command: 'model', args: 'fable', origin: TYPED } as never)
    await w.clock.advance(1000)

    expect(w.ran).toContain(`rename ${FULL.replace('Opus 5.5', 'Fable 5.1')}`)
  })

  test('/nametag compact saves the preset and renames this session', async ($, on) => {
    const w = world(on)

    await start($, w)
    const answer = await $.command.run({ command: 'nametag', args: 'compact', origin: TYPED } as never)

    expect(answer.text).toContain('hess-laundry')
    expect((w.store.get(CONFIG_KEY) as { template: string }).template).toBe('compact')

    await w.clock.advance(1000)
    expect(w.ran).toContain('rename hess-laundry')
  })

  test('/nametag presets previews every preset', async ($, on) => {
    const w = world(on)

    await start($, w)
    const answer = await $.command.run({ command: 'nametag', args: 'presets', origin: TYPED } as never)

    expect(answer.text).toContain('> full')
    expect(answer.text).toContain('compact  hess-laundry')
  })

  test('a /clear sets the name and color again under the new id', async ($, on) => {
    const w = world(on)

    await start($, w)
    const color = w.ran[1]

    await $.session.end({ reason: 'clear', sessionId: 'sess-b', resume: { id: 'sess-b' } } as never)
    w.session.id = 'sess-c'
    await w.clock.advance(1000)

    expect(w.ran.slice(2)).toEqual([`rename ${FULL}`, color])
    expect(w.store.has(`${LIVE_PREFIX}sess-c`)).toBe(true)
    expect(w.store.has(`${LIVE_PREFIX}sess-b`)).toBe(false)
  })

  test('the session ending is remembered for a resume', async ($, on) => {
    const w = world(on)

    await start($, w)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-b', resume: { id: 'sess-b' } } as never)

    expect(w.store.has(`${LIVE_PREFIX}sess-b`)).toBe(false)
    expect((w.store.get(`${SEEN_PREFIX}sess-b`) as { title: string; n: number }).title).toBe(FULL)
  })
})
