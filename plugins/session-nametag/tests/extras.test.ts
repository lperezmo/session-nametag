import { describe, expect, test, tier } from 'claude-code/testing'

import { branchFromHead, codenameFor, dayKey, gitDirFromFile, originFromConfig, remoteSlug, shorten, sigilFor, SIGILS } from '../hooks/extras'
import { render, usedTokens, type TagValues } from '../hooks/tag'

tier('user')

const V: TagValues = {
  model: 'Opus 5.5',
  folder: 'pyofiles',
  dir: 'pyofiles',
  branch: 'main',
  n: 1,
  host: 'OFFICE20',
  startedAt: new Date(2026, 9, 7, 9, 5).getTime(),
  updatedAt: new Date(2026, 9, 7, 9, 5).getTime(),
}

describe('shorten', () => {
  test('long text is cut on a word', () => {
    expect(shorten('one two three four', 10)).toBe('one two…')
  })
})

describe('git', () => {
  test('the branch from HEAD, the short commit when detached', () => {
    expect(branchFromHead('ref: refs/heads/fix/backfill\n')).toBe('fix/backfill')
    expect(branchFromHead('abc1234def5678\n')).toBe('abc1234')
    expect(branchFromHead('')).toBe('')
  })

  test('a worktree .git file points at its git folder', () => {
    expect(gitDirFromFile('gitdir: D:/Python/x/.git/worktrees/y\n', 'D:/Python/y')).toBe('D:/Python/x/.git/worktrees/y')
    expect(gitDirFromFile('gitdir: ../x/.git/worktrees/y\n', '/home/u/y')).toBe('/home/u/y/../x/.git/worktrees/y')
    expect(gitDirFromFile('nonsense', '/a')).toBe('')
  })

  test('the origin url from the config', () => {
    const config = '[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://host/a/b\n[remote "origin"]\n\turl = git@host:owner/x.git\n\tfetch = +refs/heads/*\n'

    expect(originFromConfig(config)).toBe('git@host:owner/x.git')
    expect(originFromConfig('[core]\n')).toBe('')
  })

  test('remotes as owner/name', () => {
    expect(remoteSlug('git@github.com:lperezmo/hess-trading.git')).toBe('lperezmo/hess-trading')
    expect(remoteSlug('https://github.com/lperezmo/pyofiles')).toBe('lperezmo/pyofiles')
    expect(remoteSlug('ssh://git@host:22/team/sub/repo.git/')).toBe('sub/repo')
    expect(remoteSlug('')).toBe('')
  })
})

describe('identity', () => {
  test('a codename is two words and the same for the same id', () => {
    expect(codenameFor('abc')).toBe(codenameFor('abc'))
    expect(codenameFor('abc')).toMatch(/^[a-z]+-[a-z]+$/)
    expect(codenameFor('abc')).not.toBe(codenameFor('abd'))
  })

  test('a folder keeps its emoji, and a chosen one wins', () => {
    expect(SIGILS).toContain(sigilFor('d:/python/pyofiles'))
    expect(sigilFor('d:/python/pyofiles')).toBe(sigilFor('d:/python/pyofiles'))
    expect(sigilFor('d:/python/pyofiles', { 'd:/python/pyofiles': '🦀' })).toBe('🦀')
  })

  test('the day key is the local date', () => {
    expect(dayKey(new Date(2026, 9, 7, 23, 59).getTime())).toBe('day.2026-10-07')
  })
})

describe('rendering the new tokens', () => {
  test('status-style names hide what is empty', () => {
    const t = '{sigil }{folder}{/branch}{ #nth}{ · topic}'

    expect(render(t, { ...V, sigil: '🦀', topic: 'fix pyo3 build' })).toBe('🦀 pyofiles/main · fix pyo3 build')
    expect(render(t, { ...V, sigil: '🦀' })).toBe('🦀 pyofiles/main')
  })

  test('remote, codename and todaycount', () => {
    expect(render('{remote} {codename}{ #todaycount today}', { ...V, remote: 'lperezmo/pyofiles', codename: 'brisk-otter', today: 7 })).toBe('lperezmo/pyofiles brisk-otter #7 today')
  })

  test('a template names the tokens it uses', () => {
    expect([...usedTokens('{folder}{/branch}{remote} plain branch text')].sort()).toEqual(['branch', 'folder', 'remote'])
  })
})
