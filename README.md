# cliffchew84.github.io

Personal website, talks, and Singapore HDB data pipelines.

This file records what is deployed where, what I have checked, and what still needs work. Keep it current when a host or
URL changes.

## Asset map

| Asset                 | Host          | Source              | Status  |
| --------------------- | ------------- | ------------------- | ------- |
| Old portfolio page    | GitHub Pages  | `profile/`          | live    |
| SG housing slide deck | GitHub Pages  | `talks/sg_housing/` | live    |
| TW dbt slide deck     | GitHub Pages  | `talks/tw_slides/`  | live    |
| HDB parquet data      | Cloudflare R2 | `data/hdb_update.py`| unknown |

## Live URLs

- <https://cliffchew84.github.io/> — portfolio (stopgap from `profile/`)
- <https://cliffchew84.github.io/profile/> — same portfolio, legacy path
- <https://cliffchew84.github.io/profile/portfolio-details.html> — inner page
- <https://cliffchew84.github.io/talks/sg_housing/> — SG housing slides
- <https://cliffchew84.github.io/talks/tw_slides/tw_dbt_slides.html> — TW slides

The root URL <https://cliffchew84.github.io/> returns 200. It now serves the
portfolio page assembled by the Actions workflow, not the README.

## Hosts

| Host          | Count    | Reviewed |
| ------------- | -------- | -------- |
| GitHub Pages  | 1 site   | yes      |
| Netlify       | 20 sites | yes      |
| Vercel        | unknown  | no       |
| Cloudflare R2 | 1 bucket | no       |

- `dist/`, `package.json`, `package-lock.json`, `netlify.toml`, `vercel.json` were removed on 2026-10-31.
- Netlify and Vercel configs are gone. The 20 Netlify sites and any Vercel project are unchanged.

## GitHub Pages

| Item          | Value                        |
| ------------- | ---------------------------- |
| Status        | built                        |
| Build type    | workflow (Actions)           |
| Source        | branch `main`, path `/`      |
| Custom domain | none                         |
| HTTPS         | enforced                     |
| Last build    | commit `25042741`, 2026-10-31 |

- The live site comes from `main`.
- `main` is the only long-lived branch. `master` was retired on 2026-10-31.
- The root URL serves the portfolio page assembled by `deploy.yml`.
- `.github/workflows/deploy.yml` runs on every push to `main`. It assembles
  `site/` from `profile/` (stopgap portfolio at root, plus `/profile/` legacy
  path), `talks/` at `/talks/`, and `.nojekyll` to disable Jekyll.
- A push to `main` also starts the R2 data sync in `hdb_parquet.yml`.

## Data pipelines

All pipeline files live in `data/`. `data/requirements.txt` lists every Python
dependency for both workflows.

`hdb_parquet.yml` runs daily at 22:00 UTC. It calls `data/hdb_update.py`. The
script reads the HDB resale dataset from data.gov.sg, then writes
`s3://cliff-hdb-data/hdb.parquet` in Cloudflare R2.

`hdb_dash.yml` runs daily at 02:30 UTC. It calls `data/create_hdb_dash.py`. The
script calls a Render deploy hook and writes `data/execute_date.txt`. The
workflow then commits the result with `PERSONAL_ACCESS_TOKEN`.

`data/full_hdb_upload.py` is a manual backfill script. No workflow calls it.

## Secrets

- `.env` is in `.gitignore` and was never committed.
- No key was found in the tracked files or in the commit history.
- Credentials live in GitHub Actions secrets.
- Secret scanning and push protection are both **disabled**.

Secrets used by workflows: `SOURCE_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`,
`PERSONAL_ACCESS_TOKEN`, `RENDER_DEPLOY`, `OGP_API_KEY`.

Secrets not used by any workflow: `BASE_URL`, `EXT_URL`, `MONGO_PASSWORD`. `BASE_URL` and `EXT_URL` are hardcoded in
`hdb_parquet.yml`. Remove these three secrets, or move the values into secrets.

## Reviewed

- GitHub Pages config, source branch, and last build.
- All workflow runs and both data workflows.
- `.env` ignore rule and full commit history.
- All Netlify sites, for repo link and status.
- HTTP status of the live URLs above.
- Personal contact data scan in tracked files: none found.

## Not reviewed

- **Vercel.** No token, CLI, or login file. Unknown project and unknown domain.
- Cloudflare R2 bucket state and file date.
- Page content on the live sites. Only HTTP status and titles were checked.

## To do

- [ ] Remove or use the unused secrets named above.
- [ ] Turn on secret scanning and push protection.
- [ ] Log in to Vercel and record the project, domain, and deploy method here.
- [ ] Record the R2 bucket public URL, if the data is public.
- [ ] **Phase 4: Build new portfolio in `portfolio/`.** When ready, update
  `deploy.yml` to copy `portfolio/*` to `site/` instead of `profile/*`.
  The new portfolio can be any framework (React, Vue, Astro, Svelte, plain
  HTML). Keep `profile/` and `talks/` copied for legacy paths.

## Check commands

```sh
# Pages config and source branch
gh api repos/cliffchew84/cliffchew84.github.io/pages

# Last Pages build
gh api repos/cliffchew84/cliffchew84.github.io/pages/builds/latest

# Recent workflow runs
gh run list --limit 5

# Page status
curl -s -o /dev/null -w "%{http_code}\n" https://cliffchew84.github.io/profile/
```
