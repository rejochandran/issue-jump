# Wiki source

These files are the source of the [project wiki](https://github.com/rejochandran/issue-jump/wiki). Edit them here, not on GitHub's wiki editor: a workflow copies this folder to the wiki whenever `main` changes, and overwrites anything edited there.

- One page per file. The file name is the page title with dashes for spaces.
- Link between pages with `[[Page name]]` or `[[link text|Page name]]`.
- `_Sidebar.md` and `_Footer.md` appear on every page.
- Embed a screenshot as `<img src="images/name.png" alt="What it shows" width="400">`. They are captured at double size for sharpness, so a plain markdown image would show twice as large as the real popup. `npm run check` enforces this.
- Screenshots live in `images/` and are generated, not hand-made. Run `npm run wiki:shots` after changing the popup, and add a line to `scripts/wiki-shots.sh` when a new screen needs one.

Any change a user would notice needs its wiki page updated in the same pull request.
