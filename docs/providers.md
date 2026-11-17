# Adding a tracker

Each tracker is one module in `extension/lib/providers/`. A provider is a plain object; `custom.js` is the smallest example and `gitlab.js` a complete one.

1. Create `extension/lib/providers/<name>.js` exporting the object described below.
2. Add it to the list in `extension/lib/providers/index.js`.
3. Add cases to `tests/core.test.mjs`: how its keys resolve, what `detect` trusts, what `clean` rejects.
4. Add fake responses to `tools/preview/stub.js` so the UI can be exercised with `npm run preview`.
5. Document it: a page in `wiki/` named after the tracker, rows in `wiki/Trackers.md`, `wiki/Home.md`, `wiki/_Sidebar.md` and `wiki/Privacy-and-permissions.md`, and a screenshot of its settings page (`scripts/wiki-shots.sh`).
6. Add the tracker to the tables in `README.md` and `PRIVACY.md`, and a line to `CHANGELOG.md`.

Test against the real service before opening the pull request and say in it what you tried.

## The provider object

A configured tracker is `{ id, type, enabled, ...your fields }`. Every function below receives it as `t`.

| Member | Required | Purpose |
|---|---|---|
| `type` | yes | Unique id, e.g. `'youtrack'` |
| `label` | yes | Display name |
| `fields` | yes | The settings form, see below |
| `clean(values)` | yes | Validate and normalise the form. Return the fields to save, or `{ error: 'message' }` |
| `detail(t)` | yes | Short text shown beside the name: a host, repository or workspace |
| `home(t)` | yes | Where to send the user to sign in |
| `origins(t)` | yes | Match patterns the lookups need, e.g. `['https://api.example.com/*']`. Return `[]` when there are none |
| `url(key, t)` | yes | The link for an issue |
| `keys: true` | | The tracker uses `ABC-123` keys |
| `repoRefs: true`, `fromRef(path, mark, n, t)` | | The tracker uses `path#12` or `path!34` references; return the canonical key or `null` |
| `fromNumber(n, t, mark)` | | The key for a bare number, or `null` when there is no default project |
| `fromUrl(url, t)` | | The key in one of this tracker's own links, or `null` |
| `searchUrl(text, t)` | | A link to the tracker's own search page |
| `detect(url)` | | Recognise the tracker from a tab address. Return starting fields plus `trusted` |
| `issue(key, t, signal)` | | Return `{ key, summary, status, statusColor }`, `{ key, missing: true }`, or `null` on failure |
| `search(text, t, signal)` | | Return a list of issues, or `null` on failure |
| `mine(t, signal)` | | Open issues assigned to the user |
| `recent(t, signal)` | | Issues the user viewed recently, each with `ts` (milliseconds) |
| `guessProject(t, signal)` | | A likely default project when none is set |
| `host(t)`, `titleFrom(title)` | | The hostname to look for in browser history, and how to get an issue title out of a page title |
| `whoami(t, signal)` | | `{ name }` when signed in, `{ error: 'auth' }` or `{ error: 'network' }` otherwise |
| `needsToken`, `canMine(t)` | | Say when lookups depend on a token |

`statusColor` is `''` (not started), `'yellow'` (in progress) or `'green'` (done).

### Fields

```js
{ name: 'site', label: 'Site', placeholder: 'tracker.example.com', required: true, help: 'Shown under the field.' }
```

Options: `short` (narrow input), `upper` (uppercase as typed), `secret` (password input, saved on the device only and never synced; the field must be called `token`), `advanced` (collapsed by default), `choices: [[value, label], ...]` (a segmented control), `when: (values) => boolean` (show conditionally), `link` (a "Create one" link after the help text).

## Rules

- **Make every request through `request()` in `lib/http.js`**, and only to the tracker's own host. Never call `fetch` directly.
- **`detect` must be strict.** Set `trusted: true` only when the address can belong to nothing but that service: an exact hostname over HTTPS. A self-hosted address can never be trusted; return `trusted: false` and the user will be asked to confirm it.
- **Prefer the browser's existing session** (`credentials: 'include'`) over asking for a token. Ask for a token only when the service's API refuses the session.
- **Jumping must work without lookups.** `url()` may not need a network request or a token.
- **Fail quietly.** Lookup functions return `null` or an error object; they never throw.
- Keep everything except the network functions pure, so it can be unit tested.
