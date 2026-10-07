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
export const PRESET_ORDER = ['compact', 'branch', 'host', 'model', 'timed', 'full'] as const

export type PresetName = (typeof PRESET_ORDER)[number]

export const PRESETS: Record<PresetName, string> = {
  compact: '{folder}{ #n}',
  branch: '{folder}{/branch}{ #n}',
  host: '{folder}{/branch}{ #n}{ @ host}',
  model: '{[model] }{folder}{/branch}{ #n}{ @ host}',
  timed: '{[model] }{folder}{/branch}{ #n}{ @ host}{ day time}',
  full: '{[model] }{folder}{/branch}{ #n}{ @ host}{ datetime}',
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
  user: string
  /** When the session first started, in epoch milliseconds. */
  startedAt: number
}

/** The token names a template may use. */
export const TOKENS = ['model', 'folder', 'dir', 'branch', 'num', 'n', 'host', 'user', 'datetime', 'date', 'day', 'time'] as const

const TOKEN_RE = new RegExp(`(?<![A-Za-z])(${TOKENS.join('|')})(?![A-Za-z])`, 'g')

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
      case 'n': return v.n > 1 ? String(v.n) : ''
      case 'num': return String(v.n)
      case 'host': return v.host
      case 'user': return v.user
      case 'datetime': return when.datetime
      case 'date': return when.date
      case 'day': return when.day
      case 'time': return when.time
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
 * A preset's template, or the text itself when it names no preset.
 *
 * @param template a preset name or a template
 */
export function resolveTemplate(template: string): string {
  return isPreset(template) ? PRESETS[template] : template
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
}

/** A session's name and color, kept after it ends so a resume can restore them. */
export type SeenEntry = {
  id: string
  n: number
  color: string | null
  title: string | null
  isManual: boolean
  at: number
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
}

export const DEFAULT_CONFIG: Config = { template: DEFAULT_PRESET, color: 'auto', isOn: true, offFolders: [] }

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
  }
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
  | { kind: 'error'; text: string }

export const USAGE = [
  'Usage: /nametag [preset|template|force|color|off|on|presets|help]',
  '  /nametag                  show this session\'s tag and the live sessions',
  '  /nametag presets          preview every preset for this session',
  `  /nametag <preset>         use a preset from now on: ${PRESET_ORDER.join(', ')}`,
  '  /nametag template <text>  use your own template, e.g. {folder}{/branch}{ #n}',
  '  /nametag force            rename and recolor this session now, even a resumed or renamed one',
  '  /nametag color <c>        auto (per folder), off, or one of: ' + COLORS.join(', '),
  '  /nametag off [here]       stop naming new sessions (here = only in this folder)',
  '  /nametag on [here]        start again',
  `Tokens: ${TOKENS.join(', ')}. A {group} with an empty token disappears, so {/branch} hides outside git and { #n} hides for the first session in a folder.`,
].join('\n')

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

  if (text.includes('{')) {
    return { kind: 'template', template: text }
  }

  return { kind: 'error', text: `Unknown option "${first}". ${PRESET_ORDER.join(', ')} are the presets; /nametag help lists the rest.` }
}
