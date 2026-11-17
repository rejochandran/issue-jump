# Privacy Policy

_Last updated: 17 November 2026_

Issue Jump is a browser extension that opens Jira issues. It is built to work without collecting anything.

## What is collected

Nothing. Issue Jump has no server, no analytics, no advertising and no account. The author never receives any information about you or how you use the extension.

## What is stored on your device

- **Settings** (your Jira address, default project and preferences) are kept in Chrome's synced storage, so they follow you to other browsers where you are signed in to Chrome. Google's sync service handles that; the author has no access to it.
- **Recent and pinned issues** (issue key, title, status and when you opened it) are kept in Chrome's local storage on this device only.

You can clear recent issues in the extension's settings. Removing the extension removes all of it.

## What is sent over the network

When previews and search are on, Issue Jump asks **your own Jira site** for issue titles, statuses, search results, your open issues and your display name. These requests go straight from your browser to the Jira address you configured, using the Jira login already in your browser. Issue Jump never sees or stores your password or session.

No request is ever made to any other server. You can turn previews and search off in settings, after which the extension makes no network requests at all.

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Tell whether the current tab is blank, look for issue keys in its title and address, and find your Jira site among open tabs on first run. Tab information is used in the moment and never stored or sent anywhere. |
| `storage` | Save the settings and recent issues described above. |
| `contextMenus` | Add "Open in Jira" to the right-click menu for selected text. |
| `https://*.atlassian.net/*` | Previews and search on Jira Cloud. |
| `clipboardRead` (optional) | Requested only if you turn on "Paste from clipboard". The clipboard is read when the popup opens, only to look for an issue key, and is never stored or sent. |
| Access to another site (optional) | Requested only for your own Jira Server / Data Center address when you add it. |

## Changes

Changes to this policy are recorded in this file's history and in the [changelog](CHANGELOG.md).

## Contact

Questions or concerns: [open an issue](https://github.com/rejochandran/issue-jump/issues).
