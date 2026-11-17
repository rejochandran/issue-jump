# Contributing to Jira Jump

Thanks for taking the time. Bug reports, ideas and pull requests are all welcome.

## Ways to help

- **Report a bug** or **suggest a feature** using the [issue templates](https://github.com/rejochandran/jira-jump/issues/new/choose).
- **Pick up an issue.** Ones labelled [`good first issue`](https://github.com/rejochandran/jira-jump/labels/good%20first%20issue) are a good start. Comment on it first so two people don't do the same work.
- **Test on Jira Server / Data Center.** Most development happens against Jira Cloud, so reports from self-hosted sites are especially useful.

For anything larger than a small fix, open an issue to talk it through before writing code.

## Setup

You need Chrome (or another Chromium browser) and Node 20 or newer. There are no dependencies to install.

```bash
git clone https://github.com/rejochandran/jira-jump.git
cd jira-jump
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

- Add or update tests in `tests/` when you change anything in `extension/lib/jira.js`.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.
- Test by hand in Chrome: light and dark theme, keyboard only, and a blank tab versus a normal page.
- Keep the pull request to one topic. Smaller ones are reviewed faster.

## Code guidelines

- **No dependencies, no build step.** Plain ES modules, HTML and CSS that Chrome runs as written. This keeps the extension small and easy to audit.
- **Never put outside text into `innerHTML`.** Anything from Jira, a web page or the user goes through `textContent`. `innerHTML` is only for the static SVG strings already in the code.
- **No network requests except to the user's configured Jira site.** No analytics, no third-party hosts, no remote code.
- **Permissions are a promise to users.** Do not add one without discussing it in an issue first. A new permission also means updating `PRIVACY.md`, `store/listing.md` and `scripts/check.mjs`.
- **Keep logic testable.** Parsing and URL building live in `extension/lib/jira.js` as pure functions with no `chrome.*` calls.
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
