# Issue Jump

Chrome extension (Manifest V3) that jumps to issues in Jira, GitHub, GitLab, Linear and custom trackers, from a popup, the address bar and the right-click menu.
Plain ES modules, HTML and CSS. No dependencies, no bundler, no build step: `extension/` ships exactly as written.

## Commands

```bash
npm test            # unit tests (node:test) for extension/lib/
npm run check       # manifest, version sync, permission and store-policy checks
npm run preview     # popup in a browser tab with a fake chrome API and fake tracker data (port 8765)
npm run build       # dist/issue-jump-<version>.zip      (--dev variant: npm run build:dev)
npm run icons       # re-render PNG icons from extension/icons/icon.svg (needs rsvg-convert)
npm run screenshots # regenerate store images (needs Chrome and rsvg-convert)
```

Run `npm test && npm run check` before finishing any change.

## Layout

- `extension/lib/core.js`: shared by popup and service worker. Top half is pure and unit tested: `resolve()` turns typed text into issue references across trackers, `detectTrackers()` recognises trackers in tabs, `migrate()` upgrades old settings. Bottom half wraps `chrome.storage`, `chrome.tabs` and `chrome.permissions`.
- `extension/lib/providers/`: one module per tracker plus `index.js`, the registry. `docs/providers.md` documents the interface.
- `extension/lib/http.js`: `request()`, the only place `fetch` is called.
- `extension/popup.{html,css,js}`: the popup. Views switched by `data-view` on `#app`: `main`, `settings`, `add`, `tracker`. `popup.js` keeps one `state` object, `buildRows()` turns it into sections of rows, `render()` paints them. Tracker forms are generated from each provider's `fields`.
- `extension/background.js`: service worker for the omnibox keyword `j`, the context menu, and fetching summaries after the popup closes.
- `tools/preview/`: dev server plus `stub.js`, which fakes `chrome.*` and tracker APIs. Scenes via `?scene=default|single|empty|setup|signedout`, with `&tab=blank`, `&q=text`, `&view=settings|add|tracker`, `&found=1`.
- `store/`: Chrome Web Store listing copy and images. `docs/releasing.md`: release and store setup.

## Data model

- A tracker is `{ id, type, enabled, ...provider fields }`. Trackers live in `chrome.storage.sync` under `trackers`; their tokens live in `chrome.storage.local` under `tokens` and are merged in by `getSettings()`. Save with `saveTrackers()`, never by writing `trackers` directly.
- An issue reference is `{ tracker, key, url }`. History entries add `summary`, `status`, `statusColor`, `pinned`, `ts`.
- `settings.numbersTo` is the tracker bare numbers go to. `settings.prefixes` maps a learned key prefix to a tracker id.

## Rules

- **No new dependencies or build tooling.** If something seems to need one, raise it instead.
- **Never pass text from a tracker, a web page or the user to `innerHTML`.** Use `textContent` or DOM methods. `innerHTML` is only used with the static `ICONS` strings in `popup.js`.
- **Network requests go only to a configured tracker's own host**, through `request()` in `lib/http.js`. No analytics, no other hosts, no remote code, no `eval`.
- **Trackers are added without asking only when `detect` returns `trusted: true`**, which is reserved for exact hostnames over HTTPS (`github.com`, `gitlab.com`, `linear.app`, a single `<name>.atlassian.net`). Anything self-hosted or ambiguous is a suggestion the user confirms. Never save a tracker taken from page content or a tab URL otherwise.
- **Tokens never go to `chrome.storage.sync`** and are sent only to the service they belong to.
- **Do not change permissions casually.** `scripts/check.mjs` pins them. A change must update `manifest.json`, `scripts/check.mjs`, `PRIVACY.md`, `store/listing.md` and the README table together, and is a major version bump.
- Host access: `*.atlassian.net` is granted at install. Every other host is requested at runtime with `chrome.permissions.request`, which only works inside a user gesture (a click handler).
- Jumping must work without lookups: `provider.url()` never needs a network request or a token.
- Keep pure logic pure and add a test in `tests/core.test.mjs` for every parsing, routing, detection or URL change.
- Jira REST: use `api/2` paths so Server / Data Center keeps working. The one exception is `api/3/search/jql` for Cloud, with an `api/2/search` fallback.
- UI: neutral greys with one accent colour, few dividers (group with spacing and a small label instead), 13px system font, sentence case, short plain copy. Colours are CSS variables in `:root` with a dark-mode block; never hard-code a colour elsewhere. Check light and dark.
- The popup must stay fully usable from the keyboard: focus stays in the input, arrow keys move `state.sel`.
- No company-specific names, sites or project keys anywhere. Examples use `acme`, `ABC-123`, `WEB-12`.

## Branches and releases

- Work on `dev` (default branch). `main` is protected and holds released code only.
- User-visible changes get a line under `## [Unreleased]` in `CHANGELOG.md`.
- The version lives in both `extension/manifest.json` and `package.json`; they must match.
- A push to `main` with a new version tags it, creates a GitHub release and publishes to the Chrome Web Store. Never push to `main` directly; open a pull request from `dev`.
- Commit subjects: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Do not add AI attribution or co-author trailers to commits or pull requests.
