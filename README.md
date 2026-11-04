# cliffchew84.github.io

Personal website, talks, and Singapore HDB data pipelines.

This file records what is deployed where, what I have checked, and what still needs work. Keep it current when a host or
URL changes.

## Asset map

| Asset                 | Host          | Source               | Status  |
| --------------------- | ------------- | -------------------- | ------- |
| Portfolio (root)      | GitHub Pages  | repo root (`.`)      | live    |
| SG housing slide deck | GitHub Pages  | `talks/sg_housing/`  | live    |
| TW dbt slide deck     | GitHub Pages  | `talks/tw_slides/`   | live    |
| HDB parquet data      | Cloudflare R2 | `data/hdb_update.py` | unknown |

## Live URLs

- <https://cliffchew84.github.io/> — portfolio (served from repo root)
- <https://cliffchew84.github.io/talks/sg_housing/> — SG housing slides
- <https://cliffchew84.github.io/talks/tw_slides/tw_dbt_slides.html> — TW slides

The root URL <https://cliffchew84.github.io/> returns 200. It serves the portfolio page assembled by the Actions
workflow (`deploy-pages.yml`), not the README.

## Hosts

| Host          | Count    | Reviewed |
| ------------- | -------- | -------- |
| GitHub Pages  | 1 site   | yes      |
| Netlify       | 20 sites | no       |
| Vercel        | unknown  | no       |
| Cloudflare R2 | 1 bucket | no       |

- `dist/`, `package.json`, `package-lock.json`, `netlify.toml`, `vercel.json` were removed on 2026-10-31.
- Netlify and Vercel configs are gone. The 20 Netlify sites and any Vercel project are unchanged (not reviewed).

## GitHub Pages

| Item          | Value                         |
| ------------- | ----------------------------- |
| Status        | built                         |
| Build type    | workflow (Actions)            |
| Source        | branch `main`, path `/`       |
| Custom domain | none                          |
| HTTPS         | enforced                      |
| Last build    | commit `7447b46f`, 2026-11-03 |

- The live site comes from `main`.
- `main` is the only long-lived branch. `master` was retired on 2026-10-31.
- The root URL serves the portfolio page assembled by `deploy-pages.yml`.
- `.github/workflows/deploy-pages.yml` runs on every push to `main`. It uploads the repo root (`.`) as the Pages artifact.
- A push to `main` also starts the R2 data sync in `hdb_parquet.yml`.

## GitHub Actions workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Deploy to GitHub Pages | `.github/workflows/deploy-pages.yml` | Push to `main` | Uploads repo root as Pages artifact; publishes portfolio to `cliffchew84.github.io/` |
| Scheduled HDB Data Sync to R2 | `.github/workflows/hdb_parquet.yml` | Daily 22:00 UTC (06:00 SGT) + push to `main` | Fetches HDB resale data from data.gov.sg, writes parquet to Cloudflare R2 |

GitHub also shows two platform-managed entries in the Actions tab:
- **Dependency Graph** — auto-scans `requirements.txt` for vulnerabilities.
- **pages-build-deployment** — internal Pages step that runs after the deploy workflow uploads the artifact.

## Analytics

PostHog tracks the portfolio. The snippet lives in `index.html`. The SDK sends events to the US Cloud host.

| Item | Value |
|------|-------|
| Project | Default project (ID 339161) |
| Ingestion host | `https://us.i.posthog.com` |
| Super property | `site: portfolio` |

Custom events sent by `script.js`:

| Event | When | Key properties |
|-------|------|----------------|
| `building_viewed` | A scroll opens | `building`, `source` (`initial`, `click`, `arrow-key`) |
| `link_clicked` | Any link click | `link_url`, `link_host`, `link_type` (`internal`, `external`, `same_page`), `entry_title` |
| `theme_toggled` | Night or day toggle | `theme` |

Pageviews and autocapture come from the default PostHog config. The project token is public and safe to ship.

### Internal traffic

PostHog ignores your own visits by default. The project has a test account filter on `internal_user`.

| URL | Effect |
|-----|--------|
| `https://cliffchew84.github.io/?internal=1` | Marks the browser as internal. Stored in localStorage. |
| `https://cliffchew84.github.io/?internal=0` | Clears the marker. Browser counts as a normal visitor. |

The flag only affects the browser where you set it. A small red "Internal" badge appears in the bottom-left corner while the flag is on. To verify the filter works, turn the flag on, reload, and check that the events show the `internal_user` property.

## Data pipelines

All pipeline files live in `data/`. `data/requirements.txt` lists every Python dependency for both workflows.

`hdb_parquet.yml` runs daily at 22:00 UTC (06:00 SGT). It calls `data/hdb_update.py`. The script reads the HDB resale dataset from data.gov.sg, then writes `s3://cliff-hdb-data/hdb.parquet` in Cloudflare R2.

`data/full_hdb_upload.py` is a manual backfill script. No workflow calls it.

## Secrets

- `.env` is in `.gitignore` and was never committed.
- No key was found in the tracked files or in the commit history.
- Credentials live in GitHub Actions secrets.
- Secret scanning and push protection are both **enabled** (2026-10-31).
- **Scan completed**: 0 alerts found. History is clean.

Secrets used by workflows: `SOURCE_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`.

All other secrets removed (2026-11-03): `PERSONAL_ACCESS_TOKEN`, `BASE_URL`, `EXT_URL`, `MONGO_PASSWORD`, `OGP_API_KEY`, `RENDER_DEPLOY`.

## Reviewed

- GitHub Pages config, source branch, and last build.
- All workflow runs and the data workflow (`hdb_parquet.yml`).
- `.env` ignore rule and full commit history.
- **Secret scanning and push protection enabled; 0 alerts found.**
- HTTP status of the live URLs above.
- Personal contact data scan in tracked files: none found.

## Not reviewed

- **Vercel.** No token, CLI, or login file. Unknown project and unknown domain.
- Cloudflare R2 bucket state and file date.
- Netlify sites (20) — repo links and status unverified.
- Page content on the live sites. Only HTTP status and titles were checked.

## HDB Resale Blog (archived)

- **Former URL:** `https://sg-housing.onrender.com/blog` (Render service deleted)
- **Source repo:** `cliffchew84/sg_housing` (local: `~/Work/tia/cliff/sg_housing/sg_housing/`)
- **Stack:** FastAPI + `fastapi-blog` (markdown posts) + Dash dashboards
- **Posts** (in `posts/`):
  - `sg-mil-public-homes-2024.md` — deep dive on million-dollar HDB flats
  - `sg-public-homes-still-cheap.md` — affordability analysis (large, chart-heavy)
  - `lowest-10-percentile.md`, `private-vs-public.md`, `sg-md-public-homes.md`, `dssg-findings.md`, `20-yrs-public-home.md`, `using-my-dash-outlier.md`, `sg-public-house-data.md`
- **Dashboards** (also in that repo):
  - `/sg-public-home-trends` — price trends
  - `/public-homes` — transaction search
- **Plan:** Extract and revise posts for new portfolio `Library` section (static MD/HTML). Dashboards can be rebuilt as static Quarto/Observable notebooks if needed.

## To do

- [x] Remove unused secrets (`PERSONAL_ACCESS_TOKEN`, `BASE_URL`, `EXT_URL`, `MONGO_PASSWORD`, `OGP_API_KEY`, `RENDER_DEPLOY`) — deleted 2026-11-03.
- [ ] Log in to Vercel and record the project, domain, and deploy method here.
- [ ] Record the R2 bucket public URL, if the data is public.
- [x] **Phase 4: Build new portfolio at repo root.** Portfolio is live at `https://cliffchew84.github.io/`. `deploy-pages.yml` uploads root (`.`). `talks/` preserved for legacy paths.
- [ ] **Migrate blog content:** Copy selected posts from `~/Work/tia/cliff/sg_housing/sg_housing/posts/` into new portfolio `content.json` (Library entries).
- [ ] Review Netlify sites: verify repo links and status for all 20 sites.

## Check commands

```sh
# Pages config and source branch
gh api repos/cliffchew84/cliffchew84.github.io/pages

# Last Pages build
gh api repos/cliffchew84/cliffchew84.github.io/pages/builds/latest

# Recent workflow runs
gh run list --limit 5

# Page status
curl -s -o /dev/null -w "%{http_code}\n" https://cliffchew84.github.io/
```
