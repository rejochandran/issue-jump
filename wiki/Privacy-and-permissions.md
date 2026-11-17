# Privacy and permissions

Issue Jump has no server, no analytics, no advertising and no account. Nothing about you or your usage is sent to the author or anyone else.

The full policy is in [PRIVACY.md](https://github.com/rejochandran/issue-jump/blob/main/PRIVACY.md). This page is the short version.

## What stays in your browser

| What | Where |
|---|---|
| Your trackers, default projects and preferences | Chrome's synced storage, so they follow you between your own browsers |
| Recent and pinned issues | This device only |
| API keys for GitHub and Linear | This device only, never synced |

## What is sent, and to whom

Only when **Previews and search** is on, and only to trackers you connected:

| Tracker | Goes to | Signed in with |
|---|---|---|
| Jira | Your Jira address | Your existing Jira login |
| GitHub | `api.github.com` | Nothing, or your token |
| GitLab | `gitlab.com` or your server | Your existing GitLab login |
| Linear | `api.linear.app` | Your API key |
| Custom | Nowhere | |

Turn **Previews and search** off and no requests are made at all.

## Why each permission exists

**Asked for when you install**

| Chrome says | Why |
|---|---|
| Read your browsing history* | To see the current tab's address and title: whether the tab is blank, whether the page mentions an issue, and which trackers you have open. Nothing is stored or sent. |
| Read and change your data on atlassian.net | Previews and search on Jira Cloud. |

\* This is how Chrome words the permission for seeing tab addresses. It does not read your history unless you turn on the option below.

**Asked for only when you turn something on**

| When | Chrome asks for | Why |
|---|---|---|
| You click **Allow** for GitHub, GitLab or Linear, or add a self-hosted tracker | Access to that one site | Previews and search there |
| You turn on **Paste from clipboard** | Reading the clipboard | To prefill a copied issue key |
| You turn on **Use browser history** | Reading your history | To find issue pages you visited on your trackers and add them to Recent |

You can take any of these back at `chrome://extensions` → Issue Jump → **Details**.

## Removing your data

- **Recent issues**: Settings → Recent issues → Clear.
- **A tracker and its key**: Settings → the tracker → Remove.
- **Everything**: remove the extension.
