# Contributing to Issue Jump

Thanks for taking the time. Bug reports, ideas and pull requests are all welcome.

## Ways to help

- **Report a bug** with the [bug form](https://github.com/rejochandran/issue-jump/issues/new?template=bug.yml).
- **Suggest a feature or request a tracker** in [Discussions › Ideas](https://github.com/rejochandran/issue-jump/discussions/categories/ideas).
- **Vote.** Upvote the [ideas](https://github.com/rejochandran/issue-jump/discussions/categories/ideas?discussions_q=category%3AIdeas+sort%3Atop) you care about. Votes decide what gets built next. An idea that is accepted becomes an issue, which is where the work is tracked.
- **Pick up an issue.** Ones labelled [`good first issue`](https://github.com/rejochandran/issue-jump/labels/good%20first%20issue) are a good start. Comment on it first so two people don't do the same work.
- **Add a tracker.** Each one is a single small file; [docs/providers.md](docs/providers.md) explains how.
- **Test on trackers we can't.** Jira Server / Data Center, self-hosted GitLab and less common setups are where reports help most.

For anything larger than a small fix, start an idea in Discussions or comment on its issue to talk it through before writing code.

## Setup

You need Chrome (or another Chromium browser) and Node 20 or newer. There are no dependencies to install.

```bash
git clone https://github.com/rejochandran/issue-jump.git
cd issue-jump
git checkout dev
npm test
```

Load it in Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `extension/` folder. After changing code, click the reload icon on the extension's card.

For UI work, `npm run preview` serves the popup at `http://localhost:8765/` with fake data and a fake `chrome` API, so you can iterate with a normal page refresh. Always finish by testing in the real extension.

## Branches

| Branch | Purpose |
|---|---|
| `dev` | Default branch. All pull requests target it. Every push produces a dev build. |
| `main` | Released code only. Protected; it changes only through a release pull request from `dev`. A merge publishes to the Chrome Web Store. |

1. Fork the repository and create a branch from `dev`: `git checkout -b fix/short-description dev`.
2. Make your change.
3. Open a pull request against `dev`.

## Before you open a pull request

```bash
npm test        # must pass
npm run check   # must pass
```

- Add or update tests in `tests/` when you change anything in `extension/lib/`.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.
- Update the user documentation in `wiki/` in the same pull request, and run `npm run wiki:shots` if the popup looks different. See [wiki/README.md](wiki/README.md).
- Test by hand in Chrome: light and dark theme, keyboard only, and a blank tab versus a normal page.
- Keep the pull request to one topic. Smaller ones are reviewed faster.

## Code guidelines

- **No dependencies, no build step.** Plain ES modules, HTML and CSS that Chrome runs as written. This keeps the extension small and easy to audit.
- **Never put outside text into `innerHTML`.** Anything from a tracker, a web page or the user goes through `textContent`. `innerHTML` is only for the static SVG strings already in the code.
- **No network requests except to a tracker the user has connected**, and only through `request()` in `lib/http.js`. No analytics, no third-party hosts, no remote code.
- **Permissions are a promise to users.** Do not add one without discussing it in an issue first. A new permission also means updating `PRIVACY.md`, `store/listing.md` and `scripts/check.mjs`.
- **Keep logic testable.** Parsing, routing and URL building are pure functions in `extension/lib/core.js` and the providers, with no `chrome.*` calls.
- Follow the style around you: two spaces, single quotes, semicolons. `.editorconfig` covers the basics.
- UI text is short, plain and sentence case.

## Commit messages

Use a short imperative subject, with a type prefix:

```
fix: keep selection when results refresh
feat: search filters by name
docs: explain the dev build
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## Review

A maintainer will review your pull request, usually within a week. CI must be green. Changes may be requested; that is normal. Once approved it is squash-merged into `dev` and goes out with the next release.

Releases are described in [docs/releasing.md](docs/releasing.md).

## Conduct and licence

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the project's [MIT License](LICENSE).
