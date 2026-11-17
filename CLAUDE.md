# Issue Jump

Chrome extension (Manifest V3) that opens Jira issues from a popup, the address bar and the right-click menu.
Plain ES modules, HTML and CSS. No dependencies, no bundler, no build step: `extension/` ships exactly as written.

## Commands

```bash
npm test          # unit tests (node:test) for extension/lib/jira.js
npm run check     # manifest, version sync, permission and store-policy checks
npm run preview   # popup in a browser tab with a fake chrome API and fake Jira data (port 8765)
npm run build     # dist/issue-jump-<version>.zip      (--dev variant: npm run build:dev)
npm run icons     # re-render PNG icons from extension/icons/icon.svg (needs rsvg-convert)
```

Run `npm test && npm run check` before finishing any change.

## Layout

- `extension/lib/jira.js`: all logic shared by popup and service worker. Top half is pure (parsing, URL building, tab rules) and unit tested; bottom half wraps `chrome.storage`, `chrome.tabs`, `chrome.permissions` and Jira REST.
- `extension/popup.{html,css,js}`: the popup. Three views switched by `data-view` on `#app`: `main`, `settings`, `setup`. `popup.js` keeps one `state` object, `buildRows()` turns it into sections of rows, `render()` paints them.
- `extension/background.js`: service worker for the omnibox keyword `j`, the context menu, and fetching summaries after the popup closes.
- `tools/preview/`: dev server plus `stub.js`, which fakes `chrome.*` and Jira responses. Scenes via `?scene=default|empty|setup|signedout`, `&tab=blank`, `&q=text`, `&view=settings`.
- `store/`: Chrome Web Store listing copy and images. `docs/releasing.md`: release and store setup.

## Rules

- **No new dependencies or build tooling.** If something seems to need one, raise it instead.
- **Never pass text from Jira, a web page or the user to `innerHTML`.** Use `textContent` or DOM methods. `innerHTML` is only used with the static `ICONS` strings in `popup.js`.
- **Network requests go only to `settings.site`**, through `rest()` in `lib/jira.js`. No analytics, no other hosts, no remote code, no `eval`.
- **Do not change permissions casually.** `scripts/check.mjs` pins them. A change must update `manifest.json`, `scripts/check.mjs`, `PRIVACY.md`, `store/listing.md` and the README table together, and is a major version bump.
- Site auto-detection only adopts `https://<name>.atlassian.net`, and only when it is the single Cloud site among open tabs. Any other origin must be typed or confirmed by the user on the setup screen; never save a site taken from page content or a tab URL without that.
- Host access: `*.atlassian.net` is granted at install. Any other Jira host is requested at runtime with `chrome.permissions.request`, which only works inside a user gesture (a click handler).
- Keep pure logic in the top half of `lib/jira.js` and add a test in `tests/jira.test.mjs` for every parsing or URL change.
- Jira REST: use `api/2` paths so Server / Data Center keeps working. The one exception is `api/3/search/jql` for Cloud, with an `api/2/search` fallback.
- UI: neutral greys with one accent colour, hairline dividers, 13px system font, sentence case, short plain copy. Colours are CSS variables in `:root` with a dark-mode block; never hard-code a colour elsewhere. Check light and dark.
- The popup must stay fully usable from the keyboard: focus stays in the input, arrow keys move `state.sel`.

## Branches and releases

- Work on `dev` (default branch). `main` is protected and holds released code only.
- User-visible changes get a line under `## [Unreleased]` in `CHANGELOG.md`.
- The version lives in both `extension/manifest.json` and `package.json`; they must match.
- A push to `main` with a new version tags it, creates a GitHub release and publishes to the Chrome Web Store. Never push to `main` directly; open a pull request from `dev`.
- Commit subjects: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Do not add AI attribution or co-author trailers to commits or pull requests.
