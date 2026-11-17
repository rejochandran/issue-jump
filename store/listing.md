# Chrome Web Store listing

Copy for the developer dashboard. Keep it in step with the README and `PRIVACY.md`.

## Store listing tab

**Name:** Issue Jump

**Summary** (132 characters max):

> Jump to any issue in one keystroke. Type a key, number, link or a few words. Works with Jira, GitHub, GitLab, Linear and more.

**Category:** Workflow & Planning (under Productivity)

**Language:** English

**Description:**

```
Issue Jump gets you to an issue faster than opening your tracker.

Press Alt+J, type "123", press Enter. That's it.

WORKS WITH
• Jira (Cloud, Server and Data Center)
• GitHub issues and pull requests
• GitLab issues and merge requests
• Linear
• Anything else with a link: Kaneo, Plane, YouTrack, Redmine, your in-house tool

Use several at once. Issue Jump sends each key to the right tracker and remembers which project lives where.

WHAT YOU CAN TYPE
• A key: ABC-123, abc123 or "abc 123"
• Just the number, for your default project or repository
• owner/repo#45 for GitHub, group/project!67 for a GitLab merge request
• A link, or a branch name with a key in it
• Several at once, to open them side by side
• A few words, to search every tracker

WHAT IT DOES FOR YOU
• Shows the issue's title and status before you open it
• Opens in a new tab, or reuses the tab you're on if it's blank
• Spots issues mentioned on the page you're viewing and offers them first
• Remembers recent issues, including ones you viewed in your tracker directly, and lets you pin the ones you return to
• Lists the open issues assigned to you, across trackers
• Works from the address bar: type "j", press space, then the key
• Adds "Jump to" to the right-click menu for selected text
• Sets itself up: trackers open in your tabs are found automatically

KEYBOARD
• Alt+J opens Issue Jump (you can change the shortcut)
• Up and Down move through the list, Enter opens
• Cmd/Ctrl+Enter forces a new tab, Shift+Enter forces the current tab
• Cmd/Ctrl+C copies the selected issue's link

PRIVATE BY DESIGN
No account, no analytics, no server. Settings and recent issues stay in your browser. Previews and search talk only to the trackers you connect. Jira and GitLab use the login you already have; GitHub works without one for public repositories; Linear needs an API key that never leaves your device.

Free and open source: https://github.com/rejochandran/issue-jump
Support development: https://github.com/sponsors/rejochandran

Issue Jump is an independent project and is not affiliated with, endorsed by or sponsored by Atlassian, GitHub, GitLab, Linear or any other tracker it works with. Their names are trademarks of their owners.
```

**Images** (all in this folder):

| Slot | File |
|---|---|
| Store icon, 128×128 | `../extension/icons/icon128.png` |
| Screenshots, 1280×800 | `screenshots/1-recent.png` to `5-settings.png` |
| Small promo tile, 440×280 | `promo-small-440x280.png` |
| Marquee promo tile, 1400×560 | `promo-marquee-1400x560.png` |

Regenerate them with `npm run screenshots`.

**Homepage URL:** https://github.com/rejochandran/issue-jump
**Support URL:** https://github.com/rejochandran/issue-jump/issues/new/choose

## Privacy practices tab

**Single purpose:**

> Issue Jump opens issues quickly: the user types or pastes an issue key, number, link or search words, and the extension opens the matching issue in their issue tracker (Jira, GitHub, GitLab, Linear or one they configure).

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Reads the active tab's URL to decide whether to reuse it (a blank new-tab page) or open a new tab, reads its title and URL to offer issue references found on the page, and recognises issue trackers among open tabs so the user does not have to configure them by hand. Nothing is stored or transmitted. |
| `storage` | Saves the user's settings (trackers, default projects, preferences), their list of recent and pinned issues, and any API key they choose to add (local storage only). |
| `contextMenus` | Adds one "Jump to" item to the right-click menu for selected text. |
| Host permission `https://*.atlassian.net/*` | Fetches issue titles, statuses and search results from the user's own Jira Cloud site through Jira's REST API, using their existing session, to show previews in the popup. |
| `clipboardRead` (optional) | Requested only when the user turns on "Paste from clipboard". Reads the clipboard when the popup opens to prefill a copied issue key. |
| `history` (optional) | Requested only when the user turns on "Use browser history". Searches history for addresses on the user's connected issue trackers and adds the issue pages found to the extension's recent-issues list. Nothing is transmitted. |
| Optional host permissions `https://*/*`, `http://*/*` | Requested for a single origin at a time, only when the user adds or approves a tracker: `api.github.com`, `gitlab.com`, `api.linear.app`, or the address of their own Jira or GitLab server. Used to fetch issue titles, statuses and search results from that tracker. Never requested broadly. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing. The extension does not collect or transmit user data. Then certify all three statements (no selling data, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/rejochandran/issue-jump/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Public. **Regions:** all. **Pricing:** free.

## Before submitting

- Tracker names appear only in the description, to say what the extension works with. Keep them out of the name and the icon.
- The first submission is manual. See [docs/releasing.md](../docs/releasing.md).
