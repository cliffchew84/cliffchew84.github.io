import json
import os
from datetime import datetime, timedelta

import polars as pl
import requests
from dotenv import load_dotenv
from urllib3.util import Retry
from requests.adapters import HTTPAdapter

load_dotenv()

# ---- env var guard -------------------------------------------------
required = ["SOURCE_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID"]
missing = [v for v in required if not os.getenv(v)]
if missing:
    raise RuntimeError(f"Missing environment variables: {missing}")

load_dotenv()


def hdb_api_calls(mth):
    # Define columns and URL
    df_cols = [
        "month",
        "block",
        "town",
        "flat_type",
        "street_name",
        "storey_range",
        "floor_area_sqm",
        "remaining_lease",
        "resale_price",
    ]
    param_fields = ",".join(df_cols)
    API_KEY = os.environ["SOURCE_API_KEY"]
    BASE_URL = "https://data.gov.sg/api/action/datastore_search"
    EXT_URL = "?resource_id=d_8b84c4ee58e3cfc0ece0d773c8ca6abc"
    full_url = BASE_URL + EXT_URL
    headers = {"X-API-Key": API_KEY, "Accept": "application/json"}
    empty_df = pl.DataFrame(schema=df_cols)

    print(full_url)

    params = {
        "fields": param_fields,
        "filters": json.dumps({"month": mth}),
        "limit": 10000,
    }
    result = empty_df
    # Retry for transient 429/500/502/503/504 — backoff 1s, max 3 tries, reuse session
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.mount("http://", HTTPAdapter(max_retries=retry))
    response = session.get(full_url, params=params, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(f"API failed {response.status_code} for month {mth}")
    if response.status_code == 200:
        table_result = pl.DataFrame(response.json().get("result").get("records"))
        if table_result.columns != []:
            result = table_result
    return result


def hdb_process(df: pl.DataFrame) -> pl.DataFrame:
    """Processing HDB API data from data.gov.sg for graphing"""
    return (
        df.with_columns(
            pl.col("month").str.to_date(format="%Y-%m"),
            # Handle remaining_lease: coerce to String first (handles all-null columns),
            # then extract numeric part, defaulting to null if missing/invalid
            pl.col("remaining_lease")
            .cast(pl.String)
            .str.extract(r"(\d+)")
            .cast(pl.Float64)
            .alias("lease"),
            pl.col("flat_type")
            .str.replace(" ROOM", "R")
            .str.replace("EXECUTIVE", "E")
            .str.replace("MULTI-GENERATION", "MG")
            .cast(pl.Categorical),
            pl.col("town").cast(pl.Categorical),
            pl.col("resale_price").cast(pl.Float64),
            area=pl.col("floor_area_sqm").cast(pl.Float64) * 10.7639,
        )
        .select("month", "town", "flat_type", "area", "lease", "resale_price")
        .rename({"resale_price": "price", "flat_type": "type"})
    )


def get_r2_storage_options() -> dict:
    """Returns R2 storage options for use across read and write operations."""
    return {
        "aws_access_key_id": os.environ["R2_ACCESS_KEY_ID"],
        "aws_secret_access_key": os.environ["R2_SECRET_ACCESS_KEY"],
        "endpoint_url": f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        "region": "auto",
    }


def load_cloudflare_parquet(df: pl.DataFrame) -> None:
    """
    Uploads and overwrites the HDB parquet file inside Cloudflare R2,
    re-applying performance optimizations optimized for client-side DuckDB-Wasm.
    """
    R2_STORAGE_OPTIONS = get_r2_storage_options()
    R2_FILE_PATH = "s3://cliff-hdb-data/hdb.parquet"

    print(f"Uploading and replacing file at: {R2_FILE_PATH}...")

    df.write_parquet(
        R2_FILE_PATH,
        storage_options=R2_STORAGE_OPTIONS,  # Uses the exact same options bundle
        compression="zstd",
        compression_level=4,
        row_group_size=35_000,  # Perfect parallel split for browser workers
        statistics=True,  # Enables frontend row-group pruning
    )
    print("Upload complete! File successfully overwritten.")


# Rolling window: fetch the last N months and refresh them in the parquet
WINDOW_MONTHS = 3  # change this one value to widen/narrow the window


def last_n_months(n: int) -> list[str]:
    """Returns the last n month strings in YYYY-MM format (oldest first)."""
    today = datetime.now().date()
    months = []
    for i in range(n - 1, -1, -1):
        # Exact month arithmetic — no approximate timedelta
        y, m = today.year, today.month
        for _ in range(i):
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        months.append(f"{y}-{m:02d}")
    return months


months_to_fetch = last_n_months(WINDOW_MONTHS)
print("Fetching months:", months_to_fetch)

latest_df = pl.concat([hdb_api_calls(m) for m in months_to_fetch]).pipe(hdb_process)
print(latest_df.shape)

# Cutoff = start of the oldest month in the window; drop everything before it
cutoff_date = datetime.strptime(months_to_fetch[0], "%Y-%m").date()

# Extracting old data and updating the latest 3 months data
# Uses scan_parquet to lazy-filter — only rows before cutoff_date are materialized
R2_STORAGE_OPTIONS = get_r2_storage_options()
R2_FILE_PATH = "s3://cliff-hdb-data/hdb.parquet"

# First-run guard: if R2 parquet hasn't been created yet, start with empty frame
try:
    old_parquet = (
        pl.scan_parquet(R2_FILE_PATH, storage_options=R2_STORAGE_OPTIONS)
        .filter(pl.col("month") < cutoff_date)
        .collect()
    )
except Exception:
    old_parquet = pl.DataFrame(
        schema=[
            "month",
            "block",
            "town",
            "flat_type",
            "street_name",
            "storey_range",
            "floor_area_sqm",
            "remaining_lease",
            "resale_price",
        ]
    )
new_parquet = pl.concat(
    [old_parquet, latest_df]
).sort("month")

load_cloudflare_parquet(new_parquet)
