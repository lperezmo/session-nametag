import { describe, expect, test, tier } from 'claude-code/testing'

import { codenameFor, dayKey, parseGitStatus, remoteSlug, shorten, sigilFor, SIGILS, topicFrom } from '../hooks/extras'
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

describe('topic', () => {
  test('the first meaningful words of a prompt', () => {
    expect(topicFrom('hey can you please fix the nametag color bug in register.ts')).toBe('fix the nametag color bug')
    expect(topicFrom('Lets add Pendleton train alerts')).toBe('add pendleton train alerts')
    expect(topicFrom('look at D:\\Python\\foo and https://x.y/z then tidy it')).toBe('look at and then tidy')
  })

  test('nothing from commands, shell lines or filler alone', () => {
    expect(topicFrom('/model fable')).toBe('')
    expect(topicFrom('!git status')).toBe('')
    expect(topicFrom('hi')).toBe('')
    expect(topicFrom('   ')).toBe('')
  })

  test('long topics are cut on a word', () => {
    expect(topicFrom('refactor everything about the extraordinarily complicated module').length).toBeLessThanOrEqual(28)
    expect(shorten('one two three four', 10)).toBe('one two…')
  })
})

describe('git', () => {
  test('branch, changes and unpushed commits from one status call', () => {
    expect(parseGitStatus('# branch.oid abc1234def\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +3 -0\n1 .M N... 100644 100644 100644 a b x.ts\n')).toEqual({ branch: 'main', isDirty: true, ahead: 3 })
    expect(parseGitStatus('# branch.oid abc1234def\n# branch.head main\n')).toEqual({ branch: 'main', isDirty: false, ahead: 0 })
    expect(parseGitStatus('# branch.oid abc1234def\n# branch.head (detached)\n')).toEqual({ branch: 'abc1234', isDirty: false, ahead: 0 })
    expect(parseGitStatus('? new.txt\n# branch.head x\n').isDirty).toBe(true)
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
    const t = '{sigil }{folder}{/branch}{dirty}{ ↑ahead}{ #nth}{ · topic}'

    expect(render(t, { ...V, sigil: '🦀', isDirty: true, ahead: 3, topic: 'fix pyo3 build' })).toBe('🦀 pyofiles/main* ↑3 · fix pyo3 build')
    expect(render(t, { ...V, sigil: '🦀' })).toBe('🦀 pyofiles/main')
  })

  test('remote, lastcommit, codename and todaycount', () => {
    expect(render('{remote} {codename}{ #todaycount today} {lastcommit}', { ...V, remote: 'lperezmo/pyofiles', codename: 'brisk-otter', today: 7, lastcommit: 'Add zip' })).toBe('lperezmo/pyofiles brisk-otter #7 today Add zip')
  })

  test('a template names the tokens it uses', () => {
    expect([...usedTokens('{folder}{/branch}{dirty} plain branch text')].sort()).toEqual(['branch', 'dirty', 'folder'])
  })
})
