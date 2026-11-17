# Chrome Web Store listing

Copy for the developer dashboard. Keep it in step with the README and `PRIVACY.md`.

## Store listing tab

**Name:** Issue Jump

**Summary** (132 characters max):

> Open any Jira issue in one keystroke. Type or paste a key, a number, a link or a few words and jump straight to it.

**Category:** Workflow & Planning (under Productivity)

**Language:** English

**Description:**

```
Issue Jump gets you to a Jira issue faster than opening Jira.

Press Alt+J, type "123", press Enter. That's it.

WHAT YOU CAN TYPE
• A key: ABC-123, abc123 or "abc 123"
• Just the number, once your default project is set
• A Jira link, a pull request link or a branch name with a key in it
• Several keys at once, to open them side by side
• A few words, to search issue titles and projects

WHAT IT DOES FOR YOU
• Shows the issue's summary and status before you open it
• Opens in a new tab, or reuses the tab you're on if it's blank
• Spots issue keys on the page you're viewing, such as a pull request, and offers them first
• Remembers recent issues and lets you pin the ones you return to
• Lists the open issues assigned to you
• Works from the address bar: type "j", press space, then the key
• Adds "Open in Jira" to the right-click menu for selected text
• Finds your Jira site on its own if you have Jira open in a tab

KEYBOARD
• Alt+J opens Issue Jump (you can change the shortcut)
• Up and Down move through the list, Enter opens
• Cmd/Ctrl+Enter forces a new tab, Shift+Enter forces the current tab
• Cmd/Ctrl+C copies the selected issue's link

PRIVATE BY DESIGN
No account, no analytics, no server. Settings and recent issues stay in your browser. Previews and search talk only to your own Jira site, using the login you already have.

Works with Jira Cloud. Jira Server and Data Center work too, after you allow access to your site.

Free and open source: https://github.com/rejochandran/issue-jump
Support development: https://github.com/sponsors/rejochandran

Issue Jump is an independent project and is not affiliated with, endorsed by or sponsored by Atlassian. Jira is a trademark of Atlassian.
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
**Support URL:** https://github.com/rejochandran/issue-jump/issues

## Privacy practices tab

**Single purpose:**

> Issue Jump opens Jira issues quickly: the user types or pastes an issue key, number, link or search words, and the extension opens the matching issue in Jira.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `tabs` | Reads the active tab's URL to decide whether to reuse it (a blank new-tab page) or open a new tab, reads its title and URL to offer issue keys found on the page, and on first run looks for an open Jira tab so the user does not have to type their Jira address. Nothing is stored or transmitted. |
| `storage` | Saves the user's settings (Jira address, default project, preferences) and their list of recent and pinned issues. |
| `contextMenus` | Adds one "Open in Jira" item to the right-click menu for selected text. |
| Host permission `https://*.atlassian.net/*` | Fetches issue summaries, statuses and search results from the user's own Jira Cloud site through Jira's REST API, using their existing session, to show previews in the popup. |
| `clipboardRead` (optional) | Requested only when the user turns on "Paste from clipboard". Reads the clipboard when the popup opens to prefill a copied issue key. |
| Optional host permissions `https://*/*`, `http://*/*` | Requested for a single origin, only when the user enters a self-hosted Jira Server / Data Center address, so previews work there too. Never requested broadly. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick nothing. The extension does not collect or transmit user data. Then certify all three statements (no selling data, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/rejochandran/issue-jump/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Public. **Regions:** all. **Pricing:** free.

## Before submitting

- "Jira" appears only in the description, to say what the extension works with. Keep it out of the name and the icon.
- The first submission is manual. See [docs/releasing.md](../docs/releasing.md).
