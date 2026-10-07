/**
 * Pure helpers for session-nametag: templates and presets, the date and model
 * labels, color and instance-number picking, the live-session registry rules
 * and the /nametag argument parser. Nothing here takes `$`, so the tests run
 * it directly.
 */

/** The eight colors `/color` accepts, in the order a folder's hash walks them. */
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const

export type ColorName = (typeof COLORS)[number]

/** Named templates, from compact to detailed. `full` is the default. */
export const PRESET_ORDER = ['compact', 'branch', 'status', 'host', 'model', 'timed', 'full'] as const

export type PresetName = (typeof PRESET_ORDER)[number]

export const PRESETS: Record<PresetName, string> = {
  compact: '{folder}{ #nth}',
  branch: '{folder}{/branch}{ #nth}',
  status: '{sigil }{folder}{/branch}{ #nth}{ · topic}',
  host: '{folder}{/branch}{ #nth}{ @ host}',
  model: '{[model] }{folder}{/branch}{ #nth}{ @ host}',
  timed: '{[model] }{folder}{/branch}{ #nth}{ @ host}{ day time}',
  full: '{[model] }{folder}{/branch}{ #nth}{ · topic}{ @ host}{ datetime}',
}

/**
 * Whether a name is one of the presets.
 *
 * @param name a word the person typed or the config holds
 */
export function isPreset(name: string): name is PresetName {
  return (PRESET_ORDER as readonly string[]).includes(name)
}

export const DEFAULT_PRESET = 'full'

/** Longest title the mod sets; the session list truncates long ones anyway. */
export const MAX_TITLE = 120

/** A live entry older than this is a session that died without saying so. */
export const STALE_MS = 3 * 60_000

/** How often a session refreshes its own live entry. */
export const HEARTBEAT_MS = 60_000

/** How long a session's remembered name and color outlive it, for resume. */
export const SEEN_TTL_MS = 30 * 24 * 60 * 60_000

export const LIVE_PREFIX = 'live.'
export const SEEN_PREFIX = 'seen.'
export const CONFIG_KEY = 'config'

/** What a template's tokens are filled from. Empty strings drop their group. */
export type TagValues = {
  model: string
  folder: string
  dir: string
  branch: string
  /** The instance number among live sessions in the same folder, from 1. */
  n: number
  host: string
  /** When the session first started, in epoch milliseconds. */
  startedAt: number
  /** When the name last changed for a reason other than this time itself. */
  updatedAt: number
  /** What the session is about, set by /nametag topic. */
  topic?: string
  /** The origin remote as owner/name. */
  remote?: string
  /** Two words that stay with the session for life. */
  codename?: string
  /** The folder's emoji. */
  sigil?: string
  /** This session's place among the sessions opened today on this machine. */
  today?: number
}

/** The token names a template may use. */
export const TOKENS = [
  'model', 'family', 'folder', 'dir', 'remote', 'branch', 'num', 'nth', 'host',
  'topic', 'codename', 'sigil', 'todaycount',
  'datetime', 'date', 'day', 'time', 'updated', 'updateddatetime', 'updateddate',
] as const

export type Token = (typeof TOKENS)[number]

/** What each token is, for /nametag help and the typeahead. */
export const TOKEN_HELP: Record<Token, string> = {
  model: 'model and version, e.g. Opus 5.5',
  family: 'model without the version, e.g. Opus',
  folder: 'the repository (worktrees and subfolders share it)',
  dir: 'the folder the session started in',
  branch: 'git branch; the group hides outside git',
  remote: 'the origin remote, e.g. lperezmo/hess-trading',
  nth: 'instance number; hidden for the first session in a folder',
  topic: 'what the session is about, set with /nametag topic <text>',
  codename: 'two words that stay with the session, e.g. brisk-otter',
  sigil: 'the folder emoji (/nametag sigil <emoji> picks one)',
  todaycount: 'which session this is today on this machine, e.g. 7',
  num: 'instance number, always shown',
  host: 'this machine\'s name',
  datetime: 'session start, e.g. Wed Oct 7th, 2026 9:05 am',
  date: 'session start date, e.g. Oct 7th, 2026',
  day: 'session start weekday, e.g. Wed',
  time: 'session start time, e.g. 9:05 am',
  updated: 'when the name last changed, e.g. 2:14 pm (Thu 2:14 pm on a later day)',
  updateddatetime: 'when the name last changed, e.g. Thu Oct 8th, 2026 11:00 am',
  updateddate: 'the day the name last changed, e.g. Oct 8th, 2026',
}

/** Groups with their usual punctuation, offered first in the typeahead. */
export const SNIPPETS: readonly { text: string; token: Token }[] = [
  { text: '{[model] }', token: 'model' },
  { text: '{[family] }', token: 'family' },
  { text: '{/branch}', token: 'branch' },
  { text: '{ #nth}', token: 'nth' },
  { text: '{ · topic}', token: 'topic' },
  { text: '{sigil }', token: 'sigil' },
  { text: '{ #todaycount today}', token: 'todaycount' },
  { text: '{ @ host}', token: 'host' },
  { text: '{ · updated}', token: 'updated' },
]

const TOKEN_RE = new RegExp('(?<![A-Za-z])(' + TOKENS.join('|') + ')(?![A-Za-z])', 'g')

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The English ordinal of a day of the month: 1st, 2nd, 3rd, 4th, 11th, 22nd.
 *
 * @param day the day of the month
 */
export function ordinal(day: number): string {
  const tens = day % 100

  if (tens >= 11 && tens <= 13) {
    return `${day}th`
  }

  const suffix = ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'

  return `${day}${day % 10 > 3 ? 'th' : suffix}`
}

/**
 * The clock time as `9:00 am`.
 *
 * @param d the moment, read in local time
 */
export function clockTime(d: Date): string {
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')

  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * The parts the date tokens render, from one moment in local time.
 *
 * @param ms epoch milliseconds
 */
export function dateParts(ms: number): { datetime: string; date: string; day: string; time: string } {
  const d = new Date(ms)
  const day = DAYS[d.getDay()] ?? ''
  const date = `${MONTHS[d.getMonth()] ?? ''} ${ordinal(d.getDate())}, ${d.getFullYear()}`
  const time = clockTime(d)

  return { datetime: `${day} ${date} ${time}`, date, day, time }
}

/**
 * When the name last changed: the clock time on the day the session started
 * (`2:14 pm`), the weekday too on a later day (`Thu 2:14 pm`).
 *
 * @param startedAt when the session started
 * @param updatedAt when the name last changed
 */
export function updatedLabel(startedAt: number, updatedAt: number): string {
  const start = new Date(startedAt)
  const d = new Date(updatedAt)
  const isSameDay = start.getFullYear() === d.getFullYear() && start.getMonth() === d.getMonth() && start.getDate() === d.getDate()

  return isSameDay ? clockTime(d) : `${DAYS[d.getDay()] ?? ''} ${clockTime(d)}`
}

/**
 * A model id as a person says it: `claude-opus-5-5` reads `Opus 5.5`,
 * `claude-sonnet-4-5-20250929[1m]` reads `Sonnet 4.5`. Unknown ids pass
 * through with only the `claude-` prefix and bracket suffix removed.
 *
 * @param id the model id or alias the session runs on
 */
export function modelLabel(id: string): string {
  const s = id.trim().toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const match = /^([a-z]+)(?:-(\d+))?(?:-(\d+))?$/.exec(s)

  const name = match?.[1]

  if (!match || !name) {
    return s
  }

  const family = name.charAt(0).toUpperCase() + name.slice(1)
  const version = [match[2], match[3]].filter(Boolean).join('.')

  return version ? `${family} ${version}` : family
}

/**
 * The last segment of a path, either separator: `D:\Python\foo` reads
 * `foo`, a drive root `D:\` reads `D:`.
 *
 * @param path an absolute path
 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)

  return parts[parts.length - 1] ?? path
}

/**
 * The key two sessions share when they run on the same project: the folder's
 * path, lowercased with one separator style, since Windows paths are
 * case-insensitive.
 *
 * @param path the repository root or working directory
 */
export function folderKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * The tokens a template uses, so only those values are worked out (each git
 * call costs a little on every turn).
 *
 * @param template the template text
 */
export function usedTokens(template: string): Set<Token> {
  const used = new Set<Token>()

  for (const group of template.matchAll(/\{([^{}]*)\}/g)) {
    for (const m of (group[1] ?? '').matchAll(new RegExp(TOKEN_RE.source, 'g'))) {
      used.add(m[1] as Token)
    }
  }

  return used
}

/**
 * Whether a folder is the other one or inside it, either separator, any case.
 *
 * @param child the folder that may be inside
 * @param parent the folder that may hold it
 */
export function isWithin(child: string, parent: string): boolean {
  const c = folderKey(child)
  const p = folderKey(parent)

  return c === p || c.startsWith(`${p}/`)
}

/**
 * Fills a template. Each `{...}` group holds one or more tokens plus any
 * literal text around them, and the whole group is dropped when one of its
 * tokens is empty: `{/branch}` vanishes outside git, `{ #n}` vanishes for the
 * first session in a folder (`num` always shows). Text outside groups is kept.
 *
 * @param template the template text
 * @param v the values
 */
export function render(template: string, v: TagValues): string {
  const when = dateParts(v.startedAt)
  const value = (token: string): string => {
    switch (token) {
      case 'model': return v.model
      case 'folder': return v.folder
      case 'dir': return v.dir
      case 'branch': return v.branch
      case 'nth': return v.n > 1 ? String(v.n) : ''
      case 'remote': return v.remote ?? ''
      case 'topic': return v.topic ?? ''
      case 'codename': return v.codename ?? ''
      case 'sigil': return v.sigil ?? ''
      case 'todaycount': return v.today ? String(v.today) : ''
      case 'num': return String(v.n)
      case 'host': return v.host
      case 'family': return v.model.split(' ')[0] ?? ''
      case 'datetime': return when.datetime
      case 'date': return when.date
      case 'day': return when.day
      case 'time': return when.time
      case 'updated': return updatedLabel(v.startedAt, v.updatedAt)
      case 'updateddatetime': return dateParts(v.updatedAt).datetime
      case 'updateddate': return dateParts(v.updatedAt).date
      default: return ''
    }
  }

  const out = template.replace(/\{([^{}]*)\}/g, (whole, inner: string) => {
    let isEmpty = false
    let isToken = false
    const filled = inner.replace(TOKEN_RE, (token: string) => {
      isToken = true
      const text = value(token)

      if (!text) {
        isEmpty = true
      }

      return text
    })

    if (!isToken) {
      return whole
    }

    return isEmpty ? '' : filled
  })

  const title = out.replace(/\s+/g, ' ').trim()

  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title
}

/**
 * A preset's or saved template's text, or the text itself when it names
 * neither.
 *
 * @param template a preset name, a saved name, or a template
 * @param saved the person's saved templates by name
 */
export function resolveTemplate(template: string, saved: Readonly<Record<string, string>> = {}): string {
  if (isPreset(template)) {
    return PRESETS[template]
  }

  return Object.prototype.hasOwnProperty.call(saved, template) ? (saved[template] ?? template) : template
}

/** Words a saved template may not be called: the presets and the options. */
export const RESERVED = ['presets', 'list', 'preview', 'template', 'force', 'apply', 'now', 'color', 'colour', 'off', 'on', 'help', 'save', 'delete', 'remove', 'topic', 'sigil', 'default', 'reset'] as const

/** How many saved templates the store keeps. */
export const MAX_SAVED = 20

/**
 * Why a name cannot be used for a saved template, or null when it can.
 *
 * @param name the name the person typed
 */
export function badName(name: string): string | null {
  if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(name)) {
    return 'Names are 1 to 24 lowercase letters, digits, - or _, starting with a letter or digit.'
  }

  if (isPreset(name) || (RESERVED as readonly string[]).includes(name)) {
    return `"${name}" is taken by a built-in preset or option; pick another name.`
  }

  return null
}

/**
 * FNV-1a, 32 bit: a stable small hash for picking a folder's color.
 *
 * @param text what to hash
 */
export function hash(text: string): number {
  let h = 0x811c9dc5

  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h
}

/**
 * The folder's own color, or the next one along that no other live session
 * holds. With all eight taken, the folder's own color repeats.
 *
 * @param key the folder key
 * @param taken colors other live sessions hold
 */
export function pickColor(key: string, taken: readonly string[]): ColorName {
  const start = hash(key) % COLORS.length

  for (let i = 0; i < COLORS.length; i++) {
    const color = COLORS[(start + i) % COLORS.length]

    if (color && !taken.includes(color)) {
      return color
    }
  }

  return COLORS[start] ?? 'blue'
}

/**
 * The lowest instance number from 1 that no other live session in the same
 * folder holds.
 *
 * @param taken numbers other live sessions in the folder hold
 */
export function pickNumber(taken: readonly number[]): number {
  let n = 1

  while (taken.includes(n)) {
    n++
  }

  return n
}

/** One running session as the shared store records it. */
export type LiveEntry = {
  id: string
  key: string
  n: number
  /** The color this mod set, or null when it set none. */
  color: string | null
  /** The last heartbeat, epoch milliseconds. */
  at: number
  /** The title this mod last set, so a manual rename can be told apart. */
  title: string | null
  /** True once the person renamed the session themselves. */
  isManual: boolean
  /** When the name last changed, for the `updated` token; absent until it does. */
  updatedAt?: number
  /** The folder /nametag force pinned the session to; absent, where it started. */
  root?: string
  /** What the session is about, set by /nametag topic. */
  topic?: string
  /** True once /nametag topic set it by hand (or switched it off). */
  isTopicSet?: boolean
  /** Two words that stay with the session for life. */
  codename?: string
  /** Its place among the sessions opened that day on this machine. */
  today?: number
}

/** A session's name and color, kept after it ends so a resume can restore them. */
export type SeenEntry = {
  id: string
  n: number
  color: string | null
  title: string | null
  isManual: boolean
  at: number
  updatedAt?: number
  root?: string
  /** What the session is about, set by /nametag topic. */
  topic?: string
  /** True once /nametag topic set it by hand (or switched it off). */
  isTopicSet?: boolean
  /** Two words that stay with the session for life. */
  codename?: string
  /** Its place among the sessions opened that day on this machine. */
  today?: number
}

/** The person's choices, shared by every session on the machine. */
export type Config = {
  /** A preset name or a custom template. */
  template: string
  /** `auto` picks per folder, `off` sets none, a color name pins one. */
  color: string
  /** False stops naming new sessions everywhere. */
  isOn: boolean
  /** Folder keys where new sessions are left alone. */
  offFolders: string[]
  /** The person's own templates by name (`/nametag save`). */
  saved: Record<string, string>
  /** Emoji the person picked per folder key (`/nametag sigil`). */
  sigils: Record<string, string>
}

export const DEFAULT_CONFIG: Config = { template: DEFAULT_PRESET, color: 'auto', isOn: true, offFolders: [], saved: {}, sigils: {} }

/**
 * A stored value as a Config, defaults filling whatever is missing or wrong.
 *
 * @param raw what the store held
 */
export function asConfig(raw: unknown): Config {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Config>

  return {
    template: typeof o.template === 'string' && o.template.trim() ? o.template : DEFAULT_CONFIG.template,
    color: typeof o.color === 'string' ? o.color : DEFAULT_CONFIG.color,
    isOn: typeof o.isOn === 'boolean' ? o.isOn : DEFAULT_CONFIG.isOn,
    offFolders: Array.isArray(o.offFolders) ? o.offFolders.filter((x): x is string => typeof x === 'string') : [],
    saved: asSaved(o.saved),
    sigils: asStrings(o.sigils),
  }
}

/**
 * A stored value as saved templates, keeping only well-formed entries.
 *
 * @param raw what the store held
 */
function asStrings(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        out[k] = v
      }
    }
  }

  return out
}

function asSaved(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [name, text] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof text === 'string' && text.trim() && badName(name) === null) {
        out[name] = text
      }
    }
  }

  return out
}

/**
 * A stored value as a LiveEntry, or null when it is not one.
 *
 * @param raw what the store held
 */
export function asLive(raw: unknown): LiveEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const o = raw as Partial<LiveEntry>

  if (typeof o.id !== 'string' || typeof o.key !== 'string' || typeof o.n !== 'number' || typeof o.at !== 'number') {
    return null
  }

  return {
    id: o.id,
    key: o.key,
    n: o.n,
    at: o.at,
    color: typeof o.color === 'string' ? o.color : null,
    title: typeof o.title === 'string' ? o.title : null,
    isManual: o.isManual === true,
    ...(typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {}),
    ...(typeof o.root === 'string' ? { root: o.root } : {}),
    ...(typeof o.topic === 'string' ? { topic: o.topic } : {}),
    ...(o.isTopicSet === true ? { isTopicSet: true } : {}),
    ...(typeof o.codename === 'string' ? { codename: o.codename } : {}),
    ...(typeof o.today === 'number' ? { today: o.today } : {}),
  }
}

/**
 * A stored value as a SeenEntry, or null when it is not one.
 *
 * @param raw what the store held
 */
export function asSeen(raw: unknown): SeenEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const o = raw as Partial<SeenEntry>

  if (typeof o.id !== 'string' || typeof o.at !== 'number') {
    return null
  }

  return {
    id: o.id,
    n: typeof o.n === 'number' ? o.n : 1,
    at: o.at,
    color: typeof o.color === 'string' ? o.color : null,
    title: typeof o.title === 'string' ? o.title : null,
    isManual: o.isManual === true,
    ...(typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {}),
    ...(typeof o.root === 'string' ? { root: o.root } : {}),
    ...(typeof o.topic === 'string' ? { topic: o.topic } : {}),
    ...(o.isTopicSet === true ? { isTopicSet: true } : {}),
    ...(typeof o.codename === 'string' ? { codename: o.codename } : {}),
    ...(typeof o.today === 'number' ? { today: o.today } : {}),
  }
}

/**
 * Whether a live entry's session still beats.
 *
 * @param entry the entry
 * @param now epoch milliseconds
 */
export function isAlive(entry: LiveEntry, now: number): boolean {
  return now - entry.at < STALE_MS
}

/**
 * The number and color a new session should take, given the other live ones.
 * When two sessions start at the same moment and pick the same number, the
 * one whose id sorts later moves on, which `settle` decides after both wrote.
 *
 * @param key this session's folder key
 * @param others the other sessions' live entries, stale ones already dropped
 * @param colorChoice the config's color: auto, off, or a pinned name
 */
export function assign(key: string, others: readonly LiveEntry[], colorChoice: string): { n: number; color: string | null } {
  const n = pickNumber(others.filter((o) => o.key === key).map((o) => o.n))
  const color = colorChoice === 'off'
    ? null
    : (COLORS as readonly string[]).includes(colorChoice)
      ? colorChoice
      : pickColor(key, others.map((o) => o.color).filter((c): c is string => c !== null))

  return { n, color }
}

/**
 * Whether this session must give up its number because another live session
 * in the same folder took it too and wins the tie (earlier id).
 *
 * @param me this session's entry
 * @param others the other sessions' live entries
 */
export function mustYield(me: LiveEntry, others: readonly LiveEntry[]): boolean {
  return others.some((o) => o.key === me.key && o.n === me.n && o.id < me.id)
}

export type Parsed =
  | { kind: 'show' }
  | { kind: 'help' }
  | { kind: 'presets' }
  | { kind: 'preset'; name: string }
  | { kind: 'template'; template: string }
  | { kind: 'apply' }
  | { kind: 'color'; color: string }
  | { kind: 'power'; isOn: boolean; isHere: boolean }
  | { kind: 'save'; name: string; template: string | null }
  | { kind: 'delete'; name: string }
  | { kind: 'named'; name: string }
  | { kind: 'topic'; mode: 'set' | 'off' | 'show'; text: string }
  | { kind: 'sigil'; emoji: string | null }
  | { kind: 'error'; text: string }

export const USAGE = [
  'Usage: /nametag [preset|default|topic|template|save|delete|force|color|sigil|off|on|presets|help]',
  '  /nametag                  show this session\'s tag and the live sessions',
  '  /nametag presets          preview every preset for this session',
  `  /nametag <preset>         use a preset from now on: ${PRESET_ORDER.join(', ')}`,
  `  /nametag default          back to the default preset (${DEFAULT_PRESET}); reset works too`,
  '  /nametag template <text>  use your own template, e.g. {folder}{/branch}{ #nth}',
  '  /nametag save <name>      keep the template in use under a name; /nametag <name> brings it back',
  '  /nametag save <name> <text>  save that template under the name and use it',
  '  /nametag delete <name>    forget a saved template',
  '  /nametag topic <text>     set what this session is about (topic off: none)',
  '  /nametag sigil <emoji>    pick the emoji for this folder (sigil auto: back to the one it was given)',
  '  /nametag force            tag this session for the folder the shell is in now, even a resumed or renamed one',
  '  /nametag color <c>        auto (per folder), off, or one of: ' + COLORS.join(', '),
  '  /nametag off [here]       stop naming new sessions (here = only in this folder)',
  '  /nametag on [here]        start again',
  'Tokens:',
  ...TOKENS.map((t) => '  ' + t.padEnd(9) + ' ' + TOKEN_HELP[t]),
  'A {group} with an empty token disappears, so {/branch} hides outside git and { #n} hides for the first session in a folder.',
].join('\n')

/** The first word after /nametag, with what it does, for the typeahead. */
export const SUBCOMMANDS: readonly { name: string; description: string }[] = [
  { name: 'presets', description: 'preview every preset for this session' },
  ...PRESET_ORDER.map((name) => ({ name, description: `preset: ${PRESETS[name]}` })),
  { name: 'default', description: `back to the default preset (${DEFAULT_PRESET})` },
  { name: 'template', description: 'your own template; type { for the tokens' },
  { name: 'save', description: 'keep the template in use under a name' },
  { name: 'delete', description: 'forget a saved template' },
  { name: 'topic', description: 'set what this session is about (off clears it)' },
  { name: 'sigil', description: 'pick this folder emoji (auto)' },
  { name: 'force', description: 'tag this session for the folder you are in now' },
  { name: 'color', description: 'auto, off, or a fixed color' },
  { name: 'off', description: 'stop tagging new sessions (add "here" for this folder only)' },
  { name: 'on', description: 'start tagging again (add "here" for this folder only)' },
  { name: 'help', description: 'commands and tokens' },
]

export type Suggestion = { text: string; label?: string; description?: string }

const COMMAND_PREFIX = '/nametag '

/**
 * The typeahead rows for the word at the cursor while /nametag is typed: its
 * options first, a color or "here" after the option that takes one, and in a
 * template the tokens as soon as a `{` is typed.
 *
 * @param text the whole prompt box
 * @param token the run of non-space characters that ends at the cursor
 * @param start where that run begins in `text`
 * @param saved the person's saved templates by name
 */
export function suggest(text: string, token: string, start: number, saved: Readonly<Record<string, string>> = {}): Suggestion[] {
  if (!text.toLowerCase().startsWith(COMMAND_PREFIX) || start < COMMAND_PREFIX.length) {
    return []
  }

  const words = text.slice(COMMAND_PREFIX.length, start).trim().split(/\s+/).filter(Boolean).map((w) => w.toLowerCase())
  const typed = token.toLowerCase()
  const brace = token.lastIndexOf('{')

  const isTemplateArg = words[0] === 'template' || (words[0] === 'save' && words.length >= 2)

  if (brace >= 0 && (words.length === 0 || isTemplateArg)) {
    const before = token.slice(0, brace)
    const partial = token.slice(brace + 1).toLowerCase()
    const letters = partial.replace(/[^a-z]/g, '')
    const rows: Suggestion[] = []

    for (const s of SNIPPETS) {
      if (s.text.toLowerCase().startsWith(`{${partial}`) || (letters && s.token.startsWith(letters))) {
        rows.push({ text: before + s.text, label: s.text, description: TOKEN_HELP[s.token] })
      }
    }

    // Punctuation typed after the { asks for a group like {/branch}; plain
    // tokens only follow letters.
    const isPlain = partial === letters

    for (const t of TOKENS) {
      if (isPlain && t.startsWith(letters) && !rows.some((r) => r.label === `{${t}}`)) {
        rows.push({ text: `${before}{${t}}`, label: `{${t}}`, description: TOKEN_HELP[t] })
      }
    }

    return rows
  }

  const mine = Object.keys(saved).sort().map((name) => ({ name, description: `saved: ${saved[name] ?? ''}` }))

  if (words.length === 0) {
    return [...SUBCOMMANDS, ...mine].filter((c) => c.name.startsWith(typed)).map((c) => ({ text: c.name, description: c.description }))
  }

  if (words.length === 1 && (words[0] === 'delete' || words[0] === 'remove')) {
    return mine.filter((c) => c.name.startsWith(typed)).map((c) => ({ text: c.name, description: c.description }))
  }

  if (words.length === 1 && (words[0] === 'color' || words[0] === 'colour')) {
    return ['auto', 'off', ...COLORS].filter((c) => c.startsWith(typed)).map((c) => ({
      text: c,
      description: c === 'auto' ? 'each folder its own color' : c === 'off' ? 'leave colors alone' : 'every session this color',
    }))
  }

  if (words.length === 1 && (words[0] === 'off' || words[0] === 'on') && 'here'.startsWith(typed)) {
    return [{ text: 'here', description: 'only sessions in this folder' }]
  }

  return []
}

/**
 * Reads what followed `/nametag`.
 *
 * @param args the command's arguments as typed
 */
export function parseArgs(args: string): Parsed {
  const text = args.trim()
  const [first = '', ...rest] = text.split(/\s+/)
  const word = first.toLowerCase()
  const tail = text.slice(first.length).trim()

  if (!word) {
    return { kind: 'show' }
  }

  if (word === 'help' || word === '?' || word === '--help') {
    return { kind: 'help' }
  }

  if (word === 'presets' || word === 'list' || word === 'preview') {
    return { kind: 'presets' }
  }

  if (isPreset(word)) {
    return { kind: 'preset', name: word }
  }

  if (word === 'default' || word === 'reset') {
    return { kind: 'preset', name: DEFAULT_PRESET }
  }

  if (word === 'template') {
    return tail ? { kind: 'template', template: tail } : { kind: 'error', text: 'Give the template after the word, e.g. /nametag template {folder}{/branch}{ #n}' }
  }

  if (word === 'force' || word === 'apply' || word === 'now') {
    return { kind: 'apply' }
  }

  if (word === 'color' || word === 'colour') {
    const color = (rest[0] ?? '').toLowerCase()

    if (color === 'auto' || color === 'off' || (COLORS as readonly string[]).includes(color)) {
      return { kind: 'color', color }
    }

    return { kind: 'error', text: `Color must be auto, off, or one of: ${COLORS.join(', ')}` }
  }

  if (word === 'off' || word === 'on') {
    const where = (rest[0] ?? '').toLowerCase()

    if (where && where !== 'here') {
      return { kind: 'error', text: `/nametag ${word} takes nothing or "here"` }
    }

    return { kind: 'power', isOn: word === 'on', isHere: where === 'here' }
  }

  if (word === 'save') {
    const name = (rest[0] ?? '').toLowerCase()

    if (!name) {
      return { kind: 'error', text: 'Give a name, e.g. /nametag save work' }
    }

    const why = badName(name)

    if (why) {
      return { kind: 'error', text: why }
    }

    const template = tail.slice(rest[0]?.length ?? 0).trim()

    return { kind: 'save', name, template: template || null }
  }

  if (word === 'topic') {
    const lower = tail.toLowerCase()

    if (!tail) {
      return { kind: 'topic', mode: 'show', text: '' }
    }

    if (lower === 'off') {
      return { kind: 'topic', mode: 'off', text: '' }
    }

    return { kind: 'topic', mode: 'set', text: tail }
  }

  if (word === 'sigil') {
    if (!tail) {
      return { kind: 'error', text: 'Give an emoji, e.g. /nametag sigil 🦀, or auto' }
    }

    return { kind: 'sigil', emoji: tail.toLowerCase() === 'auto' ? null : tail }
  }

  if (word === 'delete' || word === 'remove') {
    const name = (rest[0] ?? '').toLowerCase()

    return name ? { kind: 'delete', name } : { kind: 'error', text: 'Give the saved name, e.g. /nametag delete work' }
  }

  if (text.includes('{')) {
    return { kind: 'template', template: text }
  }

  // Maybe one of the person's saved templates; the command knows which exist.
  if (!rest.length && badName(word) === null) {
    return { kind: 'named', name: word }
  }

  return { kind: 'error', text: `Unknown option "${first}". ${PRESET_ORDER.join(', ')} are the presets; /nametag help lists the rest.` }
}
