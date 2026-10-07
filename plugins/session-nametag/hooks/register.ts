/**
 * session-nametag: names and colors each Claude Code session when it starts,
 * so a desktop full of sessions (and the Remote Control list on a phone) can
 * be told apart at a glance.
 *
 * - The name comes from a template (`/nametag <preset>` or `/nametag
 *   template ...`) and is set by running /rename. After each turn and each
 *   /model it is worked out again, and renamed only when it changed (a branch
 *   switch, a new model). A /rename typed by the person stops that.
 * - The color is set by running /color. A folder hashes to one of the eight
 *   colors, moving to the next free one when another live session holds it.
 * - Live sessions keep an entry in the shared store with a heartbeat; that is
 *   where the per-folder instance number and the taken colors come from.
 * - A resumed session the mod tagged before (a /relaunch, a plain --resume)
 *   gets its number and color back and keeps updating. A resumed session it
 *   never tagged keeps its name. /nametag force renames either.
 *
 * Why /rename and not the SessionStart hook's `sessionTitle`: the built-in
 * security mod passes every classic hook event past user-installed mods, so
 * a mod cannot answer it. /rename and /color each leave one short line.
 *
 * Every `$.noun.verb(...)` is written literally; the loader inventories them.
 */

import type { EngineInterface, On } from 'claude-code'

import {
  asConfig,
  asLive,
  asSeen,
  assign,
  baseName,
  CONFIG_KEY,
  folderKey,
  HEARTBEAT_MS,
  isAlive,
  isPreset,
  LIVE_PREFIX,
  modelLabel,
  mustYield,
  parseArgs,
  PRESET_ORDER,
  PRESETS,
  render,
  resolveTemplate,
  SEEN_PREFIX,
  SEEN_TTL_MS,
  suggest,
  USAGE,
  type Config,
  type LiveEntry,
  type TagValues,
} from './tag'

const COMMAND_NAME = 'nametag'

/** The first tag waits for the prompt to mount, then retries while it is busy. */
const START_DELAY_MS = 800
const RUN_RETRIES = 20
const RUN_RETRY_MS = 500

/** `$.command.run` inside a hook that holds a turn or command is refused, so it waits a beat. */
const DEFER_MS = 300

const GIT_TIMEOUT_MS = 3000

/** This session's live entry; null when the mod is not tagging it. */
let me: LiveEntry | null = null

let isHeartbeat = false

/** The host and the start time never change mid-session, so they are read once. */
let fixed: { host: string; startedAt: number } | null = null

async function readConfig($: EngineInterface): Promise<Config> {
  return asConfig(await $.store.get(CONFIG_KEY))
}

async function save($: EngineInterface, entry: LiveEntry) {
  await $.store.set(`${LIVE_PREFIX}${entry.id}`, entry)
}

/**
 * Every other live session's entry. Stale ones (a crash, a killed terminal)
 * are deleted on the way, and so are remembered sessions past their time.
 *
 * @param $ the engine interface
 * @param selfId this session's id, left out of the answer
 */
async function others($: EngineInterface, selfId: string): Promise<LiveEntry[]> {
  const now = await $.clock.now()
  const keys = await $.store.keys()
  const live: LiveEntry[] = []

  for (const key of keys) {
    if (key.startsWith(LIVE_PREFIX)) {
      const entry = asLive(await $.store.get(key))

      if (!entry || !isAlive(entry, now)) {
        await $.store.delete(key)
      } else if (entry.id !== selfId) {
        live.push(entry)
      }
    } else if (key.startsWith(SEEN_PREFIX)) {
      const seen = asSeen(await $.store.get(key))

      if (!seen || now - seen.at > SEEN_TTL_MS) {
        await $.store.delete(key)
      }
    }
  }

  return live
}

/**
 * The machine's name: the environment first, then /etc/hostname, then the
 * `hostname` program.
 *
 * @param $ the engine interface
 */
async function hostName($: EngineInterface): Promise<string> {
  const fromEnv = (await $.env.get('COMPUTERNAME')) ?? (await $.env.get('HOSTNAME'))

  if (fromEnv) {
    return fromEnv.trim()
  }

  try {
    const text = await $.fs.read('/etc/hostname', { as: 'text' })

    if (typeof text === 'string' && text.trim()) {
      return text.trim()
    }
  } catch {
    // Not Linux, or not readable; ask the program.
  }

  try {
    const run = await $.process.run(['hostname'], { timeoutMs: GIT_TIMEOUT_MS })

    return run.exitCode === 0 ? run.stdout.trim() : ''
  } catch {
    return ''
  }
}

/**
 * The checked-out branch, or the short commit when detached; empty outside git.
 *
 * @param $ the engine interface
 * @param cwd where to ask
 */
async function branchName($: EngineInterface, cwd: string): Promise<string> {
  try {
    const run = await $.process.run(['git', 'branch', '--show-current'], { cwd, timeoutMs: GIT_TIMEOUT_MS })

    if (run.exitCode !== 0) {
      return ''
    }

    const branch = run.stdout.trim()

    if (branch) {
      return branch
    }

    const head = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], { cwd, timeoutMs: GIT_TIMEOUT_MS })

    return head.exitCode === 0 ? head.stdout.trim() : ''
  } catch {
    return ''
  }
}

/**
 * What the template is filled from, for this session right now, and the key
 * of its folder (the repository's main folder, so worktrees and subfolders
 * count as the project they belong to).
 *
 * @param $ the engine interface
 * @param n the instance number
 */
async function values($: EngineInterface, n: number): Promise<{ v: TagValues; key: string }> {
  const root = await $.session.root()
  const repo = await $.session.repo()
  const project = repo?.root ?? root

  if (!fixed) {
    fixed = { host: await hostName($), startedAt: (await $.session.usage()).startedAt }
  }

  const v: TagValues = {
    model: modelLabel(await $.session.model()),
    folder: baseName(project),
    dir: baseName(root),
    branch: repo ? await branchName($, root) : '',
    n,
    host: fixed.host,
    startedAt: fixed.startedAt,
    updatedAt: me?.updatedAt ?? fixed.startedAt,
  }

  return { v, key: folderKey(project) }
}

/**
 * Whether the mod should leave this session alone: switched off, off for the
 * folder, or off through NAMETAG_OFF (a project's settings `env` or the shell).
 *
 * @param $ the engine interface
 * @param config the person's choices
 * @param key the folder key
 */
async function isOff($: EngineInterface, config: Config, key: string): Promise<boolean> {
  const env = (await $.env.get('NAMETAG_OFF')) ?? ''

  return !config.isOn || config.offFolders.includes(key) || (env !== '' && env !== '0' && env.toLowerCase() !== 'false')
}

/**
 * Runs /rename and then /color (either may be left out) once nothing holds
 * the prompt, retrying while the session is still mounting or busy.
 *
 * @param $ the engine interface
 * @param title the new name, or null to leave it
 * @param color the new color, or null to leave it
 * @param delayMs the wait before the first try
 * @param tries attempts left
 */
function runSoon($: EngineInterface, title: string | null, color: string | null, delayMs = DEFER_MS, tries = RUN_RETRIES) {
  if (!title && !color) {
    return
  }

  $.clock.after(delayMs, async () => {
    try {
      if (title) {
        await $.command.run({ command: 'rename', args: title })
      }

      if (color) {
        await $.command.run({ command: 'color', args: color })
      }
    } catch (error) {
      if (tries > 1) {
        runSoon($, title, color, RUN_RETRY_MS, tries - 1)
      } else {
        $.ui.log(`session-nametag could not tag this session: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })
}

/**
 * Takes a number and a color for this session, writes its live entry, and
 * moves to the next number if another session starting at the same moment
 * took the same one and wins the tie.
 *
 * @param $ the engine interface
 * @param id this session's id
 * @param key the folder key
 * @param config the person's choices
 * @param keep a color to keep instead of picking one (a resume), or undefined
 * @param preferN the number to keep when it is still free (a resume)
 */
async function claim($: EngineInterface, id: string, key: string, config: Config, keep?: string | null, preferN?: number): Promise<LiveEntry> {
  const now = await $.clock.now()
  let live = await others($, id)
  const picked = assign(key, live, config.color)
  const isFree = preferN !== undefined && !live.some((o) => o.key === key && o.n === preferN)
  const entry: LiveEntry = { id, key, n: isFree ? preferN : picked.n, color: keep === undefined ? picked.color : keep, at: now, title: null, isManual: false }

  await save($, entry)

  for (let i = 0; i < 5; i++) {
    live = await others($, id)

    if (!mustYield(entry, live)) {
      break
    }

    entry.n = assign(key, live, 'off').n
    await save($, entry)
  }

  return entry
}

/**
 * Tags the session once it has started. A session with turns already in it
 * was resumed or forked: one this mod tagged before gets its number and color
 * back; any other keeps its name and only gets a color.
 *
 * @param $ the engine interface
 */
async function tagAtStart($: EngineInterface) {
  const config = await readConfig($)
  const id = await $.session.id()
  const { key } = await values($, 1)

  if (await isOff($, config, key)) {
    return
  }

  const seen = asSeen(await $.store.get(`${SEEN_PREFIX}${id}`))

  if (seen) {
    me = await claim($, id, key, config, seen.color, seen.n)
    me = { ...me, title: seen.title, isManual: seen.isManual, ...(seen.updatedAt ? { updatedAt: seen.updatedAt } : {}) }

    const { v } = await values($, me.n)
    let title = me.isManual ? null : render(resolveTemplate(config.template), v)
    const isRename = title !== null && title !== seen.title

    if (title && isRename) {
      const now = await $.clock.now()

      title = render(resolveTemplate(config.template), { ...v, updatedAt: now })
      me = { ...me, title, updatedAt: now }
    }

    await save($, me)
    runSoon($, isRename ? title : null, me.color, START_DELAY_MS)

    return
  }

  if ((await $.session.turns()) > 0) {
    // Resumed, forked, or the mod was just installed into a running session:
    // its name and color may be the person's own, and neither can be read, so
    // leave both. It still holds a number; /nametag force tags it.
    me = await claim($, id, key, config, null)
    me = { ...me, isManual: true }
    await save($, me)

    return
  }

  me = await claim($, id, key, config)

  const { v } = await values($, me.n)
  const title = render(resolveTemplate(config.template), v)

  me = { ...me, title }
  await save($, me)
  runSoon($, title, me.color, START_DELAY_MS)
}

/**
 * Works the name out again and renames when it changed: a branch switch, a
 * /model, a new template.
 *
 * @param $ the engine interface
 */
async function refresh($: EngineInterface) {
  if (!me || me.isManual || !me.title) {
    return
  }

  const config = await readConfig($)
  const { v } = await values($, me.n)
  const title = render(resolveTemplate(config.template), v)

  if (title === me.title) {
    return
  }

  // Something real changed: that is the moment the `updated` token shows.
  const now = await $.clock.now()
  const updated = render(resolveTemplate(config.template), { ...v, updatedAt: now })

  me = { ...me, title: updated, updatedAt: now }
  await save($, me)
  runSoon($, updated, null)
}

/**
 * Names and colors this session now, whatever its state: /nametag force and
 * a preset change use it.
 *
 * @param $ the engine interface
 */
async function applyNow($: EngineInterface): Promise<string> {
  const id = await $.session.id()
  const config = await readConfig($)

  if (!me) {
    const { key } = await values($, 1)

    me = await claim($, id, key, config)
  }

  if (!me.color && config.color !== 'off') {
    me = { ...me, color: assign(me.key, await others($, id), config.color).color }
  }

  const now = await $.clock.now()
  const { v } = await values($, me.n)
  const title = render(resolveTemplate(config.template), { ...v, updatedAt: now })

  me = { ...me, title, isManual: false, at: now, updatedAt: now }
  await save($, me)
  runSoon($, title, me.color)

  return title
}

/**
 * Forgets this session's live entry and remembers its number, name and color
 * for a later resume.
 *
 * @param $ the engine interface
 * @param entry the session's entry
 */
async function retire($: EngineInterface, entry: LiveEntry) {
  await $.store.delete(`${LIVE_PREFIX}${entry.id}`)
  await $.store.set(`${SEEN_PREFIX}${entry.id}`, { id: entry.id, n: entry.n, color: entry.color, title: entry.title, isManual: entry.isManual, at: await $.clock.now(), updatedAt: entry.updatedAt })
}

/**
 * After a /clear the process goes on under a new id and the color is reset:
 * carry the entry over and set the name and color again.
 *
 * @param $ the engine interface
 * @param before the entry from before the clear
 */
async function afterClear($: EngineInterface, before: LiveEntry) {
  const id = await $.session.id()

  me = { ...before, id, at: await $.clock.now() }
  await save($, me)
  runSoon($, me.isManual ? null : me.title, me.color)
}

/**
 * The answer to a bare /nametag: this session's tag and the live sessions.
 *
 * @param $ the engine interface
 */
async function status($: EngineInterface): Promise<string> {
  const config = await readConfig($)
  const id = await $.session.id()
  const live = await others($, id)
  const template = isPreset(config.template) ? `preset "${config.template}"` : `template ${config.template}`
  const lines = [
    me ? `This session: ${me.title ?? '(name left as is)'}${me.color ? `, ${me.color}` : ''}${me.isManual ? ', name kept as you set it' : ''}` : 'This session is not tagged. /nametag force tags it.',
    `Naming: ${template}. Color: ${config.color}.${config.isOn ? '' : ' Off for new sessions.'}${config.offFolders.length ? ` Off in ${config.offFolders.length} folder(s).` : ''}`,
  ]

  if (live.length) {
    lines.push('Other live sessions:')

    for (const o of live) {
      lines.push(`  ${o.title ?? baseName(o.key)}${o.color ? ` (${o.color})` : ''}`)
    }
  }

  return lines.join('\n')
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    if (!e.isInteractive) {
      return result
    }

    await $.command.register({
      name: COMMAND_NAME,
      description: 'Name and color this session: presets, templates, force, color, off',
      argumentHint: '[preset|template|force|color|off|on|presets|help]',
    })

    if (!isHeartbeat) {
      isHeartbeat = true
      $.clock.every(HEARTBEAT_MS, async () => {
        if (me) {
          me = { ...me, at: await $.clock.now() }
          await save($, me)
        }
      })
    }

    // A hot reload starts the module over mid-session: pick the entry back up
    // instead of tagging again.
    const existing = asLive(await $.store.get(`${LIVE_PREFIX}${await $.session.id()}`))

    if (existing) {
      me = existing

      return result
    }

    $.clock.after(0, () => {
      tagAtStart($).catch((error: unknown) => {
        $.ui.log(`session-nametag could not tag this session: ${error instanceof Error ? error.message : String(error)}`)
      })
    })

    return result
  })

  // The typeahead under the prompt while /nametag is typed: options, colors,
  // and the template tokens once a { is typed.
  on('prompt.autocomplete', async ($, e, next) => {
    const result = await next(e)
    const mine = suggest(e.text, e.token, e.start)

    return mine.length ? { suggestions: [...result.suggestions, ...mine] } : result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (!e.agentId) {
      await refresh($)
    }

    return result
  })

  on('command.run', async ($, e, next) => {
    const isPlugin = e.origin?.kind === 'plugin'

    if (e.command === 'rename' && !isPlugin && me) {
      me = { ...me, isManual: true }
      await save($, me)
    }

    if (e.command === 'color' && !isPlugin && me) {
      me = { ...me, color: null }
      await save($, me)
    }

    if (e.command === 'model') {
      const result = await next(e)

      $.clock.after(DEFER_MS, () => {
        refresh($).catch(() => undefined)
      })

      return result
    }

    if (e.command !== COMMAND_NAME) {
      return next(e)
    }

    const parsed = parseArgs(e.args)

    switch (parsed.kind) {
      case 'show':
        return { text: await status($) }
      case 'help':
        return { text: USAGE }
      case 'error':
        return { text: parsed.text }
      case 'presets': {
        const { v } = await values($, me?.n ?? 1)
        const config = await readConfig($)
        const lines = PRESET_ORDER.map((name) => `${name === config.template ? '>' : ' '} ${name.padEnd(8)} ${render(PRESETS[name], v)}`)

        return { text: ['Presets for this session (> is in use; /nametag <name> picks one):', ...lines].join('\n') }
      }
      case 'preset':
      case 'template': {
        const config = await readConfig($)
        const template = parsed.kind === 'preset' ? parsed.name : parsed.template

        await $.store.set(CONFIG_KEY, { ...config, template })
        const title = await applyNow($)

        return { text: `New sessions will be named like this one: ${title}` }
      }
      case 'apply': {
        const title = await applyNow($)

        return { text: `Tagged: ${title}` }
      }
      case 'color': {
        const config = await readConfig($)

        await $.store.set(CONFIG_KEY, { ...config, color: parsed.color })

        if (me && parsed.color !== 'off') {
          const live = await others($, me.id)
          const color = assign(me.key, live, parsed.color).color

          me = { ...me, color }
          await save($, me)
          runSoon($, null, color)

          return { text: `Color: ${parsed.color}${color && color !== parsed.color ? ` (${color} for this session)` : ''}.` }
        }

        if (me && parsed.color === 'off') {
          me = { ...me, color: null }
          await save($, me)
        }

        return { text: `Color: ${parsed.color}. New sessions follow it.` }
      }
      case 'power': {
        const config = await readConfig($)

        if (parsed.isHere) {
          const { key } = await values($, 1)
          const offFolders = parsed.isOn ? config.offFolders.filter((k) => k !== key) : [...new Set([...config.offFolders, key])]

          await $.store.set(CONFIG_KEY, { ...config, offFolders })

          return { text: `New sessions in this folder will ${parsed.isOn ? 'be tagged again' : 'be left alone'}.` }
        }

        await $.store.set(CONFIG_KEY, { ...config, isOn: parsed.isOn })

        return { text: parsed.isOn ? 'New sessions will be tagged again.' : 'New sessions will be left alone. /nametag on turns it back on.' }
      }
    }
  })
    // A failure here must never cost the person their command.
    .catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    const result = await next(e)

    if (me) {
      const before = me

      me = null

      if (e.reason === 'clear') {
        await $.store.delete(`${LIVE_PREFIX}${before.id}`)
        $.clock.after(DEFER_MS, () => {
          afterClear($, before).catch(() => undefined)
        })
      } else {
        await retire($, before)
      }
    }

    return result
  })
}
