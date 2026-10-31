#!/usr/bin/env python3
"""
Fetch ALL historical HDB data from 2020 to present and upload complete dataset to R2.
This replaces the existing parquet with a fresh, consistent dataset.
"""
import json
import os
import time
from datetime import datetime

import polars as pl
import requests
from dotenv import load_dotenv
from urllib3.util import Retry
from requests.adapters import HTTPAdapter

load_dotenv()

required = ["SOURCE_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID"]
missing = [v for v in required if not os.getenv(v)]
if missing:
    raise RuntimeError(f"Missing environment variables: {missing}")


def get_r2_storage_options() -> dict:
    return {
        "aws_access_key_id": os.environ["R2_ACCESS_KEY_ID"],
        "aws_secret_access_key": os.environ["R2_SECRET_ACCESS_KEY"],
        "endpoint_url": f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        "region": "auto",
    }


def hdb_process(df: pl.DataFrame) -> pl.DataFrame:
    """Process HDB API data from data.gov.sg for graphing"""
    return (
        df.with_columns(
            pl.col("month").str.to_date(format="%Y-%m"),
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
        .with_columns((pl.col("block") + " " + pl.col("street_name")).alias("address"))
        .select("month", "town", "flat_type", "area", "lease", "resale_price", "address")
        .rename({"resale_price": "price", "flat_type": "type"})
    )


def get_all_months(start_year: int = 2017) -> list[str]:
    """Returns all months from start_year-01 to current month (oldest first)."""
    today = datetime.now().date()
    months = []
    for year in range(start_year, today.year + 1):
        for month in range(1, 13):
            if year == today.year and month > today.month:
                break
            months.append(f"{year}-{month:02d}")
    return months


def fetch_month(mth: str, session: requests.Session) -> pl.DataFrame:
    """Fetch one month of HDB data."""
    df_cols = [
        "month", "block", "town", "flat_type", "street_name", "storey_range",
        "floor_area_sqm", "remaining_lease", "resale_price",
    ]
    empty_df = pl.DataFrame(schema=df_cols)

    API_KEY = os.environ["SOURCE_API_KEY"]
    BASE_URL = "https://data.gov.sg/api/action/datastore_search"
    EXT_URL = "?resource_id=d_8b84c4ee58e3cfc0ece0d773c8ca6abc"
    full_url = BASE_URL + EXT_URL
    headers = {"X-API-Key": API_KEY, "Accept": "application/json"}

    params = {
        "fields": ",".join(df_cols),
        "filters": json.dumps({"month": mth}),
        "limit": 10000,
    }

    response = session.get(full_url, params=params, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(f"API failed {response.status_code} for month {mth}")

    table_result = pl.DataFrame(response.json().get("result", {}).get("records", []))
    if table_result.columns != []:
        return table_result
    return empty_df


def load_cloudflare_parquet(df: pl.DataFrame) -> None:
    """Uploads and overwrites the HDB parquet file in Cloudflare R2."""
    R2_STORAGE_OPTIONS = get_r2_storage_options()
    R2_FILE_PATH = "s3://cliff-hdb-data/hdb.parquet"

    print(f"Uploading and replacing file at: {R2_FILE_PATH}...")
    print(f"DataFrame shape: {df.shape}")

    df.write_parquet(
        R2_FILE_PATH,
        storage_options=R2_STORAGE_OPTIONS,
        compression="zstd",
        compression_level=4,
        row_group_size=35_000,
        statistics=True,
    )
    print("Upload complete! File successfully overwritten.")


if __name__ == "__main__":
    months = get_all_months(2020)
    print(f"Fetching {len(months)} months from {months[0]} to {months[-1]}")

    session = requests.Session()
    retry = Retry(total=5, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.mount("http://", HTTPAdapter(max_retries=retry))

    all_dfs = []
    for i, mth in enumerate(months):
        print(f"[{i+1}/{len(months)}] Fetching {mth}...")
        try:
            df = fetch_month(mth, session)
            if df.height > 0:
                all_dfs.append(df)
            else:
                print(f"  No data for {mth}")
        except Exception as e:
            print(f"  Error for {mth}: {e}")
        time.sleep(0.3)  # Be polite to the API

    if not all_dfs:
        raise RuntimeError("No data fetched!")

    print(f"Concatenating {len(all_dfs)} DataFrames...")
    combined = pl.concat(all_dfs)
    print(f"Raw combined shape: {combined.shape}")

    print("Processing...")
    processed = hdb_process(combined)
    print(f"Processed shape: {processed.shape}")
    print(f"Columns: {processed.columns}")

    # Sort by month for better query performance
    processed = processed.sort("month")

    print("Uploading to R2...")
    load_cloudflare_parquet(processed)
    print("Done!")