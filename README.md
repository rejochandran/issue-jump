# Issue Jump

[![CI](https://github.com/rejochandran/issue-jump/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/rejochandran/issue-jump/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rejochandran/issue-jump)](https://github.com/rejochandran/issue-jump/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome extension that jumps to any issue in one keystroke. Press `Alt+J`, type `123`, hit Enter.

It works with Jira, GitHub, GitLab and Linear, and with any other tracker you give it a link pattern for.

![The Issue Jump popup showing recent issues from several trackers](store/screenshots/1-recent.png)

## What it does

- **Understands whatever you paste.** `ABC-123`, `abc123`, just `123`, `owner/repo#45`, `!67`, a link, a branch name, or several at once.
- **Routes it to the right tracker.** Use Jira at work and GitHub for open source in the same popup. It learns which project lives where.
- **Opens in the right place.** A new tab normally, the current tab when it is blank. Hold `⌘`/`Ctrl` or `Shift` to choose.
- **Shows the issue before you open it.** Title and status appear as you type.
- **Searches when you don't know the key.** Type a few words to search every connected tracker.
- **Knows what you're looking at.** Issues mentioned in the current page's title or address are offered first.
- **Keeps your recent and pinned issues**, including ones you viewed in Jira directly, plus the open issues assigned to you.
- **Works from the address bar** (`j`, space, then a key) and from the right-click menu on selected text.
- **Sets itself up.** Trackers open in your tabs are found and added on their own.

## Trackers

| Tracker | Jump | Previews and search | Assigned to me | Needs |
|---|---|---|---|---|
| Jira Cloud, Server, Data Center | ✓ | ✓ | ✓ | Being signed in to Jira |
| GitHub issues and pull requests | ✓ | ✓ public repositories | with a token | A token only for private repositories |
| GitLab issues and merge requests | ✓ | ✓ | ✓ | Being signed in to GitLab |
| Linear | ✓ | with an API key | with an API key | An API key for anything beyond jumping |
| Custom (Kaneo, Plane, YouTrack, Redmine, ...) | ✓ | | | A link pattern such as `https://tracker.example/issues/{key}` |

Want another tracker built in? See [docs/providers.md](docs/providers.md); a provider is one small file.

**[Read the documentation](https://github.com/rejochandran/issue-jump/wiki)** for setup guides, every tracker, settings and troubleshooting.

## Install

**Chrome Web Store:** coming soon.

**From a release:**

1. Download `issue-jump-x.y.z.zip` from the [latest release](https://github.com/rejochandran/issue-jump/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder.

**From source:** clone the repository and load the `extension/` folder the same way.

## Using it

| You type | Issue Jump opens |
|---|---|
| `ABC-123`, `abc123`, `abc 123` | ABC-123 in Jira or Linear |
| `123` or `#123` | Issue 123 in your default project or repository |
| `owner/repo#45` | That GitHub issue or pull request |
| `group/project!67` or `!67` | That GitLab merge request |
| a link or branch name containing a key | that issue |
| `ABC-1, ABC-2, #45` | all three, the first one focused |
| `checkout bug` | matching issues from every tracker, or a full search |

| Key | Action |
|---|---|
| `Alt+J` | Open the popup (change it at `chrome://extensions/shortcuts`) |
| `↑` `↓` | Move through the list |
| `Enter` | Open the selected row |
| `⌘`/`Ctrl` + `Enter` | Open in a new tab |
| `Shift` + `Enter` | Open in the current tab |
| `⌘`/`Ctrl` + `C` | Copy the selected row's link |
| `Tab` (empty box) | Switch between Recent and Assigned to me |
| `⌘`/`Ctrl` + `,` | Settings |

The default project is learned from the first issue you open. If a key could belong to two trackers, both are offered the first time and the choice is remembered.

## Privacy

Issue Jump has no server, no analytics and no account. Settings and recent issues stay in your browser. Previews and search talk only to the trackers you have connected. See [PRIVACY.md](PRIVACY.md).

| Permission | Why |
|---|---|
| `tabs` | See whether the current tab is blank, read its title and address for issue references, and find your trackers on first run |
| `storage` | Save settings and recent issues |
| `contextMenus` | The right-click "Jump to" item |
| `*.atlassian.net` | Previews and search on Jira Cloud |
| `clipboardRead` (optional) | Only if you turn on "Paste from clipboard" |
| `history` (optional) | Only if you turn on "Use browser history", to add issues you visited to Recent |
| Other sites (optional) | Asked for one at a time, only for a tracker you add: `api.github.com`, `gitlab.com`, `api.linear.app` or your own server |

## Development

No build step and no dependencies. You need Node 20 or newer for the tooling.

```bash
npm test          # unit tests
npm run check     # manifest, version and store-policy checks
npm run preview   # the popup in a normal browser tab, with fake data
npm run build     # dist/issue-jump-<version>.zip
npm run wiki:shots # regenerate the screenshots in wiki/images
```

```
extension/          the extension itself; this folder is what ships
  lib/core.js       working out what was typed, settings, history, tabs
  lib/http.js       the only place network requests are made
  lib/providers/    one file per tracker
  popup.*           the popup
  background.js     address bar, right-click menu
tests/              unit tests for lib/
wiki/               source of the user documentation, published to the GitHub wiki
tools/preview/    browser preview with a fake chrome API
scripts/          check, build and icon rendering
store/            Chrome Web Store listing text and images
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved and [docs/releasing.md](docs/releasing.md) for how releases reach the store.

## Ideas and requests

- **[Suggest a feature or request a tracker](https://github.com/rejochandran/issue-jump/discussions/new?category=ideas)** in Discussions.
- **[Upvote existing ideas](https://github.com/rejochandran/issue-jump/discussions/categories/ideas?discussions_q=category%3AIdeas+sort%3Atop)**. The most upvoted are worked on first.
- **[Ask a question](https://github.com/rejochandran/issue-jump/discussions/new?category=q-a)**.
- **[Report a bug](https://github.com/rejochandran/issue-jump/issues/new?template=bug.yml)**.

The same links are under **Feedback** in the extension's settings. You need a free GitHub account.

## Support the project

Issue Jump is free and will stay free. If it saves you time, you can help by starring the repository or [sponsoring its development](https://github.com/sponsors/rejochandran).

## License

[MIT](LICENSE)

Issue Jump is an independent project. It is not affiliated with, endorsed by or sponsored by Atlassian, GitHub, GitLab, Linear or any other tracker it works with. Their names are trademarks of their owners.
