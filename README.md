# session-nametag

A Claude Code mod that names and colors every session when it starts, so a
desktop full of sessions (and the Remote Control list on your phone) is easy
to tell apart.

```
/rename [Opus 5.5] hess-laundry/fix/backfill #2 · fix the backfill script @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am
/color pink
```

- **Name** from a template: model, folder, git branch, instance number,
  machine, start time. Change the style with `/nametag <preset>`.
- **Color** per folder: each folder hashes to one of the eight `/color`
  colors, and moves to the next free one if another live session has it.
- **Stays current**: after a turn that switched branches, or a `/model`, the
  name is updated. A `/rename` you type yourself stops that for the session.
- **Resume aware**: a session reopened with `--resume` or `/relaunch` gets its
  number and color back. A session it never tagged (an older resume, or one
  already running when you install the mod) keeps its name and color until
  you run `/nametag force`.

## Install

```
/plugin install session-nametag --marketplace lperezmo/session-nametag
```

Mods need `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

## Presets

`#2` only shows when a second session is open in the same folder, and the
branch only shows inside git.

| Preset | Example |
|---|---|
| `compact` | `hess-laundry #2` |
| `branch` | `hess-laundry/fix/backfill #2` |
| `status` | `🧺 hess-laundry/fix/backfill* ↑2 #2 · fix the backfill script` |
| `host` | `hess-laundry/fix/backfill #2 @ LUIS-DESKTOP` |
| `model` | `[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP` |
| `timed` | `[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP Wed 9:05 am` |
| `full` (default) | `[Opus 5.5] hess-laundry/fix/backfill #2 · fix the backfill script @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am` |

## Your own template

```
/nametag template {folder}{/branch}{ #nth}{ · topic}
```

Typing `/nametag ` shows the options as you type, and inside a template a
`{` lists every token.

| Token | Example |
|---|---|
| `model` | Opus 5.5 |
| `family` | Opus |
| `folder` | hess-laundry (the repository, so worktrees and subfolders share it) |
| `dir` | the folder the session started in |
| `remote` | lperezmo/hess-laundry |
| `branch` | fix/backfill |
| `dirty` | `*` when there are uncommitted changes |
| `ahead` | 2 (commits not pushed yet; hidden at 0) |
| `lastcommit` | Fix the backfill script for… |
| `nth` | 2 (hidden for the first session in a folder) |
| `num` | 1 (always shown) |
| `host` | LUIS-DESKTOP |
| `topic` | fix the backfill script (from the first prompt, or `/nametag topic`) |
| `codename` | brisk-otter (fixed for the session) |
| `sigil` | 🧺 (an emoji per folder) |
| `todaycount` | 7 (the 7th session started today on this machine) |
| `datetime` | Wed Oct 7th, 2026 9:05 am |
| `date` | Oct 7th, 2026 |
| `day` | Wed |
| `time` | 9:05 am |
| `updated` | 2:14 pm, or Thu 2:14 pm on a later day |
| `updateddatetime` | Thu Oct 8th, 2026 11:00 am |
| `updateddate` | Oct 8th, 2026 |

The date tokens are when the session started and never move, even when a
branch switch renames it. The `updated` tokens are when the name last changed. Each
`{...}` group is dropped when one of its tokens is empty, so `{/branch}`
disappears outside git. `dirty` and `ahead` rename the session when you edit,
commit or push, so they leave a few more `/rename` lines than the others.

## Commands

| Command | What it does |
|---|---|
| `/nametag` | This session's tag and the other live sessions |
| `/nametag presets` | Preview every preset for this session |
| `/nametag <preset>` | Use a preset from now on and rename this session |
| `/nametag template <text>` | Use your own template |
| `/nametag save <name> [text]` | Keep the template in use (or the one given) under a name |
| `/nametag <name>` | Switch to a saved template |
| `/nametag delete <name>` | Forget a saved template |
| `/nametag topic <text>` | Set what this session is about; `auto` takes it from the next prompt, `off` clears it |
| `/nametag sigil <emoji>` | Pick this folder's emoji; `auto` goes back to the one it was given |
| `/nametag force` | Tag this session for the folder you are in now (after a `cd`), even a resumed or renamed one |
| `/nametag color <c>` | `auto` (per folder), `off`, or a fixed color |
| `/nametag off [here]` | Stop tagging new sessions, everywhere or in this folder |
| `/nametag on [here]` | Start again |

To switch it off for a whole project, team included, set `NAMETAG_OFF=1` in
the project's `.claude/settings.json` `env`.

## What it does on your machine

- Runs `/rename` and `/color` in the session. Each leaves one short line in
  the transcript. A mod cannot set the name silently: the built-in security
  mod keeps classic hook events such as SessionStart away from installed mods.
- Runs `git branch --show-current` in the session's folder, and `hostname`
  only when no host name is in the environment.
- Keeps a small record per session in the mod's own store on this machine:
  session id, folder path, number, color, name, last heartbeat. Ended
  sessions are forgotten after 30 days. Nothing leaves your machine.

## License

MIT
