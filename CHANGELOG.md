# Changelog

All notable changes to Issue Jump are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-11-17

### Added

- More trackers: GitHub (issues and pull requests), GitLab (issues and merge requests) and Linear, alongside Jira.
- Custom trackers: add Kaneo, Plane, YouTrack, Redmine or any other tool by pasting a link pattern.
- Use several trackers at once. Keys, numbers and links are routed to the right one, search covers all of them, and "Assigned to me" combines them.
- New reference styles: `owner/repo#123`, `#123` and `!45`.
- Trackers open in your tabs are found and set up automatically. New ones are offered when they appear.
- A setting for which tracker bare numbers go to.
- A Sponsor link in settings.

### Changed

- Renamed from Jira Jump to Issue Jump.
- Settings now start with a list of your trackers, each with its own page.
- Existing settings and recent issues carry over.

### Security

- A tracker is only added without asking when its address can belong to nothing else (`github.com`, `gitlab.com`, `linear.app`, or a single `<name>.atlassian.net`). Self-hosted look-alikes and multiple Jira Cloud sites are offered as suggestions to confirm.
- API keys for GitHub and Linear are stored on the device only and are never synced.

## [1.0.0] - 2026-11-17

First public release.

### Added

- Open an issue by key, bare number, link or branch name, or several at once.
- Smart tab handling: new tab normally, the current tab when it is blank, with `⌘`/`Ctrl` and `Shift` overrides.
- Live issue preview with summary and status.
- Search by text across issues and projects, with a fallback to Jira's own search.
- Issue keys found on the current page are offered first.
- Recent and pinned issues, and a list of open issues assigned to you.
- Address bar keyword `j` and a right-click "Open in Jira" item for selected text.
- Automatic setup from an open Jira tab, with a short setup screen when none is found.
- Support for Jira Cloud and, with permission, Jira Server / Data Center.
- Settings for the Jira site, default project, where issues open, previews, clipboard prefill and a custom issue link.

[Unreleased]: https://github.com/rejochandran/issue-jump/compare/v1.1.0...dev
[1.1.0]: https://github.com/rejochandran/issue-jump/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rejochandran/issue-jump/releases/tag/v1.0.0
