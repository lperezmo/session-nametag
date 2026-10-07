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
- **Topic** you set: `/nametag topic fix the backfill script` puts what you
  are working on in the name.
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
| `status` | `🧺 hess-laundry/fix/backfill #2 · fix the backfill script` |
| `host` | `hess-laundry/fix/backfill #2 @ LUIS-DESKTOP` |
| `model` | `[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP` |
| `timed` | `[Opus 5.5] hess-laundry/fix/backfill #2 @ LUIS-DESKTOP Wed 9:05 am` |
| `full` (default) | `[Opus 5.5] hess-laundry/fix/backfill #2 · fix the backfill script @ LUIS-DESKTOP Wed Oct 7th, 2026 9:05 am` |

## Your own template

```
/nametag template {folder}{/branch}{ #nth}{ · topic}
```

`/nametag help` lists every token.

| Token | Example |
|---|---|
| `model` | Opus 5.5 |
| `family` | Opus |
| `folder` | hess-laundry (the repository, so worktrees and subfolders share it) |
| `dir` | the folder the session started in |
| `remote` | lperezmo/hess-laundry |
| `branch` | fix/backfill |
| `nth` | 2 (hidden for the first session in a folder) |
| `num` | 1 (always shown) |
| `host` | LUIS-DESKTOP |
| `topic` | fix the backfill script (set with `/nametag topic`) |
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
disappears outside git.

## Commands

| Command | What it does |
|---|---|
| `/nametag` | This session's tag and the other live sessions |
| `/nametag presets` | Preview every preset for this session |
| `/nametag <preset>` | Use a preset from now on and rename this session |
| `/nametag default` | Back to the default preset (`full`); `reset` works too |
| `/nametag template <text>` | Use your own template |
| `/nametag save <name> [text]` | Keep the template in use (or the one given) under a name |
| `/nametag <name>` | Switch to a saved template |
| `/nametag delete <name>` | Forget a saved template |
| `/nametag topic <text>` | Set what this session is about; `off` clears it |
| `/nametag sigil <emoji>` | Pick this folder's emoji; `auto` goes back to the one it was given |
| `/nametag force` | Tag this session for the folder you are in now (after a `cd`), even a resumed or renamed one |
| `/nametag color <c>` | `auto` (per folder), `off`, or a fixed color |
| `/nametag off [here]` | Stop tagging new sessions, everywhere or in this folder |
| `/nametag on [here]` | Start again |

To switch it off for a whole project, team included, set `NAMETAG_OFF=1` in
the project's `.claude/settings.json` `env`.

## What it does on your machine

Nothing leaves your machine. The mod makes no network calls and sends no
data anywhere; everything below stays local.

- **Slash commands it runs:** `/rename` and `/color`, in this session only,
  when the session starts, when the name changes (branch switch, `/model`,
  topic, a `/nametag` command) and never otherwise. Each leaves one short line
  in the transcript. A mod cannot set the name silently: the built-in security
  mod keeps classic hook events such as SessionStart away from installed mods.
- **Programs it starts:** none. Git is read from its files, not by running
  `git`.
- **What it reads:** the repository's `.git/HEAD` (the branch) and, only
  when your template uses `remote`, `.git/config` (the origin URL); the host
  name (`COMPUTERNAME`, `HOSTNAME`, `/etc/hostname`, or on macOS
  `/Library/Preferences/SystemConfiguration/preferences.plist`); the `NAMETAG_OFF`
  variable; the session's folder, model and start time. It never reads your
  prompts or the conversation: `topic` is only what you type after
  `/nametag topic`. No tokens, keys or credentials.
- **Hooks:** `session.start` registers `/nametag` and tags the session;
  `turn.complete` re-checks git after each turn; `command.run` handles
  `/nametag`, notices a manual `/rename` or `/color` and refreshes after
  `/model`; `session.end` keeps the name across `/clear` and `/relaunch`.
- **What it stores:** a small record per session in the mod's own store on
  this machine: session id, folder path, number, color, name, topic, last
  heartbeat; plus your settings and saved templates. Ended sessions are
  forgotten after 30 days.

## License

MIT
