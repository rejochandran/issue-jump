# Releasing

Feature branches and forks feed `dev` through pull requests. `main` is what users have. Merging `dev` into `main` publishes.

## What the automation does

| Event | Workflow | Result |
|---|---|---|
| Pull request to `dev` or `main` | `ci.yml` | Tests, popup tests, checks and the description check run. |
| Merge into `dev` | `dev-build.yml` | A dev build named "Issue Jump (dev)" is attached to the workflow run and to the rolling [`dev-latest`](https://github.com/rejochandran/issue-jump/releases/tag/dev-latest) pre-release. It installs next to the store version. |
| Merge into `main` | `release.yml` | If the manifest version has no tag yet: tests, build, a `vX.Y.Z` tag and GitHub release with the zip, then upload and publish to the Chrome Web Store. |

If a merge into `main` has no version bump, the release workflow does nothing.

## Protection

| What | Rule |
|---|---|
| `main` | Pull request from `dev` required, `check` and `description` must pass, conversations resolved; no direct, forced or deleting pushes. Applies to admins too. |
| `dev` | Pull request from a feature branch or fork required, `check` and `description` must pass; no direct, forced or deleting pushes. Applies to admins too. |
| Tags `v*` | Cannot be moved or deleted once created, so a released version always points at the same code. |

## Environments

| Environment | Deploys from | What it is |
|---|---|---|
| `dev` | `dev` | The rolling dev build on the `dev-latest` pre-release |
| `production` | `main` | The Chrome Web Store. Holds the store secrets. |

Both are visible under **Deployments** on the repository page. Each only accepts runs from its own branch.

## Cutting a release

`main` only changes through a pull request. Direct pushes are refused for everyone, including the owner, and a pull request can only be merged when CI passes.

1. On a branch such as `chore/release-X.Y.Z`, set the new version in **both** `extension/manifest.json` and `package.json`.
2. In `CHANGELOG.md`, move what is under `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section, leave an empty `## [Unreleased]` above it, and update the links at the bottom.
3. Run `npm run test:all`, open a pull request to `dev`, merge it, and try the resulting dev build in Chrome.
4. Open the release pull request with the release template:
   `https://github.com/rejochandran/issue-jump/compare/main...dev?expand=1&template=release.md`
   Title it `Release X.Y.Z`. Describe what users get and how it was tested, and tick the checklist.
5. Wait for both checks: **check** (tests, popup tests, policy checks, build) and **description** (the pull request explains itself, the title matches the manifest version, the checklist is ticked).
6. Merge with a **merge commit**, not squash, so `main` and `dev` share history.
7. Watch the **Release** workflow. The store usually reviews an update within a few days.

Version numbers: patch for fixes, minor for features, major for anything that breaks existing behaviour or adds a required permission.

### What a good description looks like

```markdown
## What does this change?

Adds GitLab merge requests.

### Added
- `group/project!34` and `!34` open merge requests, with title and status in the list.
### Fixed
- Search no longer shows the same issue twice when it is also in Recent.

Worth a close look: `forNumber()` in core.js now tries other trackers for `!`.

## How did you test it?

Unit and popup tests pass. Loaded the dev build and opened merge requests on gitlab.com,
by full reference, by `!34` and by link. Not tried on a self-hosted GitLab.
```

## One-time Chrome Web Store setup

The first version has to be uploaded by hand, because the store only issues an extension ID after that.

1. Register at the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time US$5 fee).
2. Create a new item and upload the zip from the latest GitHub release.
3. Fill in the listing using [`store/listing.md`](../store/listing.md) and the images in `store/`. Set the privacy policy URL to `https://github.com/rejochandran/issue-jump/blob/main/PRIVACY.md`.
4. Submit for review. Copy the **item ID** from the dashboard URL.

Then give the workflow access to the store API:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Chrome Web Store API**.
2. Configure the OAuth consent screen (External, add your own account as a test user, then publish the app so the refresh token does not expire after 7 days).
3. Create an **OAuth client ID** of type *Desktop app*. Note the client ID and secret.
4. Get a refresh token for the scope `https://www.googleapis.com/auth/chromewebstore`, signed in as the account that owns the store item. The [official guide](https://developer.chrome.com/docs/webstore/using-api) walks through it.
5. In the repository, go to **Settings → Environments → production** and add these secrets:

   | Secret | Value |
   |---|---|
   | `CWS_EXTENSION_ID` | The item ID from the dashboard |
   | `CWS_CLIENT_ID` | OAuth client ID |
   | `CWS_CLIENT_SECRET` | OAuth client secret |
   | `CWS_REFRESH_TOKEN` | The refresh token |

Until those secrets exist, the release workflow still creates the GitHub release and simply skips the store step.

Optional: add yourself as a required reviewer on the `production` environment to get a confirmation click before anything is published.

## If a release goes wrong

- **Store upload failed:** fix the cause, then re-run the failed job from the Actions tab. The tag and GitHub release are reused.
- **Bad release already published:** fix forward with a patch version. The store has no instant rollback.
