import json
import os
from datetime import datetime, timedelta

import polars as pl
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["SOURCE_API_KEY"]
BASE_URL = os.environ.get("BASE_URL", "https://data.gov.sg/api/action/datastore_search")
EXT_URL = os.environ.get("EXT_URL", "?resource_id=d_8b059b2e34d588b0d36b4038734cd28d")


def hdb_api_calls(mth):
    df_cols = [
        "month",
        "town",
        "flat_type",
        "floor_area_sqm",
        "remaining_lease",
        "resale_price",
    ]
    param_fields = ",".join(df_cols)

    full_url = BASE_URL + EXT_URL
    headers = {"X-API-Key": API_KEY, "Accept": "application/json"}
    params = {
        "fields": param_fields,
        "filters": json.dumps({"month": mth}),
        "limit": 10000,
    }

    result = pl.DataFrame(schema={c: pl.String for c in df_cols})
    response = requests.get(full_url, params=params, headers=headers, timeout=60)

    if response.status_code == 200:
        records = response.json().get("result", {}).get("records", [])
        if records:  # Cleaner way to check if data actually exists
            result = pl.DataFrame(records)

    return result


def hdb_process(df: pl.DataFrame) -> pl.DataFrame:
    """Processing HDB API data from data.gov.sg for graphing"""
    return (
        df.with_columns(
            pl.col("month").str.to_date(format="%Y-%m"),
            pl.col("remaining_lease")
            .str.split(" ")
            .list[0]
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


def extract_cloudflare_parquet() -> pl.DataFrame:
    """Downloads the HDB parquet file from Cloudflare R2 using shared configurations."""

    R2_STORAGE_OPTIONS = {
        "aws_access_key_id": os.environ["R2_ACCESS_KEY_ID"],
        "aws_secret_access_key": os.environ["R2_SECRET_ACCESS_KEY"],
        "endpoint_url": f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        "region": "auto",
    }
    R2_FILE_PATH = "s3://cliff-hdb-data/hdb.parquet"

    print(f"Streaming data from Cloudflare R2: {R2_FILE_PATH}")
    return pl.read_parquet(R2_FILE_PATH, storage_options=R2_STORAGE_OPTIONS)


def load_cloudflare_parquet(df: pl.DataFrame) -> None:
    """
    Uploads and overwrites the HDB parquet file inside Cloudflare R2,
    re-applying performance optimizations optimized for client-side DuckDB-Wasm.
    """
    R2_STORAGE_OPTIONS = {
        "aws_access_key_id": os.environ["R2_ACCESS_KEY_ID"],
        "aws_secret_access_key": os.environ["R2_SECRET_ACCESS_KEY"],
        "endpoint_url": f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        "region": "auto",
    }
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


# Pulling current dates
today = datetime.now().date()
current_mth = today.strftime("%Y-%m")

# 3. Safe, clean previous month calculation
# Replace the first day of this month, subtract 1 day to land on the previous month safely
first_day_this_month = today.replace(day=1)
previous_mth = (first_day_this_month - timedelta(days=1)).strftime("%Y-%m")
print(current_mth, previous_mth)

# Combining them the forming new data
latest_df = pl.concat(
    [
        hdb_api_calls(previous_mth),
        hdb_api_calls(current_mth),
    ]
).pipe(hdb_process)

cutoff_date = datetime.strptime(previous_mth, "%Y-%m").date()

# Extracting old data and updating the latest two months data
old_parquet = extract_cloudflare_parquet()
new_parquet = pl.concat(
    [old_parquet.filter(pl.col("month") < cutoff_date), latest_df]
).sort("month")

load_cloudflare_parquet(new_parquet)
