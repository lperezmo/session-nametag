/**
 * Pure helpers for the tokens beyond place and time: topic, git status,
 * remote, codename, sigil and today's count. Nothing here takes `$`.
 */

import { hash } from './tag'

/** Words a prompt often opens with that say nothing about its subject. */
const FILLER = new Set([
  'a', 'an', 'the', 'please', 'pls', 'plz', 'hey', 'hi', 'hello', 'ok', 'okay', 'so', 'um', 'uh', 'yo',
  'can', 'could', 'would', 'will', 'you', 'u', 'we', 'i', 'me', 'us', 'lets', "let's", 'let', 'want', 'wanna',
  'need', 'to', 'like', "i'd", 'id', 'help', 'just', 'quickly', 'go', 'ahead', 'and', 'now', 'claude',
])

const TOPIC_WORDS = 5
const TOPIC_MAX = 28

/**
 * Cuts text to a length on a word boundary, with an ellipsis when it was cut.
 *
 * @param text the text
 * @param max the most characters to keep
 */
export function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()

  if (t.length <= max) {
    return t
  }

  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')

  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * A short subject from a prompt: its first few meaningful words, with
 * greetings, politeness, paths, links and code left out. Empty for a slash
 * command, a shell line, or a prompt with nothing usable in it.
 *
 * @param prompt the person's prompt
 */
export function topicFrom(prompt: string): string {
  const text = prompt.trim()

  if (!text || text.startsWith('/') || text.startsWith('!')) {
    return ''
  }

  const words = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\s+/)
    .filter((w) => !/[\\/]/.test(w))
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)

  let start = 0

  while (start < words.length && FILLER.has((words[start] ?? '').toLowerCase())) {
    start++
  }

  const picked = words.slice(start, start + TOPIC_WORDS)

  return picked.length ? shorten(picked.join(' ').toLowerCase(), TOPIC_MAX) : ''
}

/** What one `git status --porcelain=v2 --branch` says. */
export type GitState = { branch: string; isDirty: boolean; ahead: number }

/**
 * Reads `git status --porcelain=v2 --branch`: the branch (the short commit
 * when detached), whether anything is uncommitted, and how far ahead of the
 * upstream branch it is.
 *
 * @param out the command's output
 */
export function parseGitStatus(out: string): GitState {
  let branch = ''
  let oid = ''
  let ahead = 0
  let isDirty = false

  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length).trim()
    } else if (line.startsWith('# branch.oid ')) {
      oid = line.slice('# branch.oid '.length).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+)/.exec(line)

      ahead = match ? Number(match[1]) : 0
    } else if (line && !line.startsWith('#')) {
      isDirty = true
    }
  }

  if (branch === '(detached)') {
    branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : ''
  }

  return { branch, isDirty, ahead }
}

/**
 * A remote URL as owner/name: scp style `git@host:owner/x.git`,
 * `https://host/owner/x` and `ssh://host/a/owner/x.git` all work.
 *
 * @param url the remote's URL
 */
export function remoteSlug(url: string): string {
  const path = url.trim().replace(/\/+$/, '').replace(/\.git$/, '').replace(/^[a-z+]+:\/\/[^/]+\//i, '').replace(/^[^@/]+@[^:]+:/, '')
  const parts = path.split('/').filter(Boolean)

  return parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] ?? '')
}

const ADJECTIVES = [
  'amber', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'daring', 'dusty', 'eager', 'fancy', 'fuzzy', 'gentle',
  'giddy', 'glossy', 'golden', 'happy', 'hasty', 'humble', 'icy', 'jolly', 'keen', 'lively', 'lucky', 'mellow',
  'mighty', 'misty', 'nimble', 'noble', 'odd', 'plucky', 'polite', 'proud', 'quick', 'quiet', 'rapid', 'rusty',
  'shiny', 'silly', 'sleepy', 'snappy', 'sneaky', 'sunny', 'swift', 'tidy', 'tiny', 'vivid', 'witty', 'zesty',
]

const ANIMALS = [
  'otter', 'badger', 'beaver', 'bison', 'camel', 'crane', 'dingo', 'eagle', 'ferret', 'finch', 'gecko', 'heron',
  'ibis', 'koala', 'lemur', 'llama', 'lynx', 'marmot', 'moose', 'newt', 'ocelot', 'orca', 'owl', 'panda',
  'pelican', 'puffin', 'quokka', 'raven', 'robin', 'salmon', 'seal', 'shrew', 'sloth', 'squid', 'stoat', 'swan',
  'tapir', 'toucan', 'turtle', 'walrus', 'weasel', 'whale', 'wombat', 'yak', 'zebra', 'magpie', 'mole', 'goose',
]

/**
 * Two words picked from the session id, the same every time for that id.
 *
 * @param id the session id
 */
export function codenameFor(id: string): string {
  const h = hash(id)

  return `${ADJECTIVES[h % ADJECTIVES.length] ?? 'brisk'}-${ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length] ?? 'otter'}`
}

/** Emoji a folder's hash picks from: plain, single-glyph, no flags or skin tones. */
export const SIGILS = [
  '🦀', '🐙', '🦊', '🐢', '🦉', '🐝', '🦋', '🐳', '🦜', '🐸', '🦔', '🐧', '🦦', '🦥', '🐌', '🦩',
  '🌵', '🍄', '🌻', '🌲', '🍀', '🌊', '🔥', '⚡', '🌙', '⭐', '🪐', '☄️', '🌈', '❄️',
  '🚂', '🚀', '⛵', '🛸', '🎈', '🎲', '🧩', '🔭', '🧪', '🧭', '🔧', '📦', '🗿', '🏔️', '🍉', '🍋',
]

/**
 * The folder's emoji: the one the person set for it, or the one its hash picks.
 *
 * @param folder the folder key
 * @param chosen emoji the person set per folder key
 */
export function sigilFor(folder: string, chosen: Readonly<Record<string, string>> = {}): string {
  return chosen[folder] ?? SIGILS[hash('sigil:' + folder) % SIGILS.length] ?? '📦'
}

/**
 * The local calendar day of a moment, as the key today's count is kept under.
 *
 * @param ms epoch milliseconds
 */
export function dayKey(ms: number): string {
  const d = new Date(ms)

  return `day.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
