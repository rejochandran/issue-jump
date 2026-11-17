# Releasing

`dev` collects changes. `main` is what users have. Merging `dev` into `main` publishes.

## What the automation does

| Event | Workflow | Result |
|---|---|---|
| Pull request to `dev` or `main` | `ci.yml` | Tests and checks run. |
| Push to `dev` | `dev-build.yml` | A dev build named "Issue Jump (dev)" is attached to the workflow run and to the rolling [`dev-latest`](https://github.com/rejochandran/issue-jump/releases/tag/dev-latest) pre-release. It installs next to the store version. |
| Push to `main` | `release.yml` | If the manifest version has no tag yet: tests, build, a `vX.Y.Z` tag and GitHub release with the zip, then upload and publish to the Chrome Web Store. |

If `main` is pushed without a version bump, the release workflow does nothing.

## Environments

| Environment | Deploys from | What it is |
|---|---|---|
| `dev` | `dev` | The rolling dev build on the `dev-latest` pre-release |
| `production` | `main` | The Chrome Web Store. Holds the store secrets. |

Both are visible under **Deployments** on the repository page. Each only accepts runs from its own branch.

## Cutting a release

1. On `dev`, set the new version in **both** `extension/manifest.json` and `package.json`.
2. In `CHANGELOG.md`, rename `## [Unreleased]` content to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]`, and update the links at the bottom.
3. Run `npm test && npm run check`.
4. Open a pull request from `dev` to `main` titled `Release X.Y.Z`. Merge it with a **merge commit** (not squash) so `main` and `dev` share history.
5. Watch the **Release** workflow. The store usually reviews an update within a few days.

Version numbers: patch for fixes, minor for features, major for anything that breaks existing behaviour or adds a permission.

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
