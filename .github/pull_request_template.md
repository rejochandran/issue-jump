## What does this change?

<!-- What changes for users or for the code, and why. Link the issue or idea it closes, e.g. "Closes #12".
     CI checks that this section and the next are filled in. -->

## How did you test it?

<!-- What you ran and tried in Chrome, against which trackers, and anything you could not test.
     Add a screenshot or short recording for UI changes. -->

## Checklist

- [ ] This pull request comes from a feature branch or fork and targets `dev`
- [ ] `npm run test:all` passes (unit tests, popup tests, checks)
- [ ] Tests added or updated: unit tests for logic, a case in `tests/ui/cases.js` for anything visible
- [ ] `CHANGELOG.md` has a line under "Unreleased" for anything users will notice
- [ ] The wiki page in `wiki/` is updated, with fresh screenshots if the popup changed
- [ ] Checked in light and dark theme, and with the keyboard only (UI changes)
- [ ] No new permissions, dependencies or network hosts (or they were agreed in an issue first)
