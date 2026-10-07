/**
 * Pure helpers for the tokens beyond place and time: git files, remote,
 * codename, sigil and today's count. Nothing here takes `$`.
 */

import { hash } from './tag'

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
 * The branch named by a repository's HEAD file: the branch, or the short
 * commit when detached; empty when HEAD says neither.
 *
 * @param head the HEAD file's text
 */
export function branchFromHead(head: string): string {
  const text = head.trim()
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(text)

  if (ref) {
    return (ref[1] ?? '').trim()
  }

  return /^[0-9a-f]{7,}$/i.test(text) ? text.slice(0, 7) : ''
}

/**
 * Where a `.git` file points: a worktree's or submodule's `.git` is a file
 * reading `gitdir: <path>`, relative to the folder holding it or absolute.
 * Empty when the text is not that.
 *
 * @param text the `.git` file's text
 * @param dir the folder holding the `.git` file
 */
export function gitDirFromFile(text: string, dir: string): string {
  const match = /^gitdir:\s*(.+)$/m.exec(text)
  const target = (match?.[1] ?? '').trim()

  if (!target) {
    return ''
  }

  return /^([a-z]:)?[\\/]/i.test(target) ? target : dir + '/' + target
}

/**
 * The `origin` remote's URL from a repository's config file; empty when it
 * has none.
 *
 * @param config the config file's text
 */
export function originFromConfig(config: string): string {
  let isOrigin = false

  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim()

    if (line.startsWith('[')) {
      isOrigin = /^\[remote\s+"origin"\]$/.test(line)
    } else if (isOrigin) {
      const match = /^url\s*=\s*(.+)$/.exec(line)

      if (match) {
        return (match[1] ?? '').trim()
      }
    }
  }

  return ''
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
