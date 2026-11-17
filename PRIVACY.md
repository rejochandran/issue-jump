# Privacy Policy

_Last updated: 17 November 2026_

Issue Jump is a browser extension that opens issues in the trackers you use, such as Jira, GitHub, GitLab and Linear. It is built to work without collecting anything.

## What is collected

Nothing. Issue Jump has no server, no analytics, no advertising and no account. The author never receives any information about you or how you use the extension.

## What is stored on your device

- **Settings** (which trackers you use, their addresses, default projects and preferences) are kept in Chrome's synced storage, so they follow you to other browsers where you are signed in to Chrome. Google's sync service handles that; the author has no access to it.
- **Recent and pinned issues** (key, title, status, link and when you last opened or viewed it) are kept in Chrome's local storage on this device only. This includes issues you viewed in Jira directly, which Jira reports, and, if you turn on "Use browser history", issues you visited in your connected trackers.
- **API keys**, if you choose to add one for GitHub or Linear, are kept in Chrome's local storage on this device only. They are never synced and are sent only to the service they belong to.

You can clear recent issues and remove any tracker, with its key, in the extension's settings. Removing the extension removes all of it.

## What is sent over the network

When previews and search are on, Issue Jump asks **the trackers you have connected** for issue titles, statuses, search results, your open issues and your display name. Each request goes straight from your browser to that tracker:

| Tracker | Requests go to | Signed in with |
|---|---|---|
| Jira | Your Jira address | The Jira login already in your browser |
| GitHub | `api.github.com` | Nothing for public repositories, or the token you added |
| GitLab | `gitlab.com` or your GitLab address | The GitLab login already in your browser |
| Linear | `api.linear.app` | The API key you added |
| Custom trackers | Nowhere | Not applicable; they only open links |

Issue Jump never sees or stores your passwords or browser sessions. No request is ever made to any other server. You can turn previews and search off in settings, after which the extension makes no network requests at all.

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Tell whether the current tab is blank, look for issue references in its title and address, and recognise trackers among open tabs so you don't have to set them up by hand. Tab information is used in the moment and never stored or sent anywhere. |
| `storage` | Save the settings, recent issues and API keys described above. |
| `contextMenus` | Add "Jump to" to the right-click menu for selected text. |
| `https://*.atlassian.net/*` | Previews and search on Jira Cloud. |
| `clipboardRead` (optional) | Requested only if you turn on "Paste from clipboard". The clipboard is read when the popup opens, only to look for an issue key, and is never stored or sent. |
| `history` (optional) | Requested only if you turn on "Use browser history". Your browser history is searched for addresses on your connected trackers from the last 30 days, and only pages that are issues are kept, as entries in Recent. No other history is read, stored or sent anywhere. |
| Access to another site (optional) | Requested one site at a time, only for a tracker you add or approve: `api.github.com`, `gitlab.com`, `api.linear.app`, or your own Jira or GitLab server. |

## Changes

Changes to this policy are recorded in this file's history and in the [changelog](CHANGELOG.md).

## Contact

Questions or concerns: [ask in Discussions](https://github.com/rejochandran/issue-jump/discussions/new?category=q-a).
