<!-- Title: "Release X.Y.Z". Open with ?template=release.md, base main, compare dev. -->

## What does this change?

<!-- What users get in this version. Group it as in the changelog: Added, Changed, Fixed, Security.
     Copy the points from CHANGELOG.md and say anything a reviewer should look at closely. -->

## How did you test it?

<!-- What was run and against what: unit and popup tests, the dev build loaded in Chrome,
     which trackers were tried with real accounts, and anything that was NOT tested. -->

## Release checklist

- [ ] Version is the same in `extension/manifest.json` and `package.json`
- [ ] `CHANGELOG.md` has a dated section for this version and the links at the bottom are updated
- [ ] `npm run test:all` passes locally and CI is green on this pull request
- [ ] The dev build was loaded in Chrome and tried by hand
- [ ] Wiki pages in `wiki/` describe this version, with fresh screenshots if the popup changed
- [ ] `README.md`, `PRIVACY.md` and `store/listing.md` are still accurate
- [ ] No new required permissions (or the version is a major bump and the store listing is updated)
