#!/usr/bin/env python3
"""Daily Telegram digest for PostHog analytics."""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

POSTHOG_API_KEY = os.environ["POSTHOG_API_KEY"]
POSTHOG_PROJECT_ID = os.environ["POSTHOG_PROJECT_ID"]
TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
POSTHOG_HOST = "https://us.posthog.com"


def query(sql: str) -> list:
    """Run a HogQL query and return results as list of rows."""
    data = json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}).encode()
    req = urllib.request.Request(
        f"{POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT_ID}/query/",
        data=data,
        headers={"Authorization": f"Bearer {POSTHOG_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp).get("results", [])


def site_label(site: str, host: str) -> str:
    """Pretty label for a site."""
    if site == "unknown":
        if "hdb" in host:
            return "hdb-resale"
        return "unknown"
    return site


def main() -> int:
    # 1. All sites summary (24h, public, no localhost, no internal)
    sites = query("""
        SELECT
            coalesce(properties.site, 'unknown') AS site,
            coalesce(properties.$host, '') AS host,
            sum(if(event = '$pageview', 1, 0)) AS pageviews,
            uniq(if(event = '$pageview', distinct_id, NULL)) AS visitors,
            sum(if(event = 'building_viewed', 1, 0)) AS section_clicks,
            sum(if(event = 'link_clicked', 1, 0)) AS link_clicks
        FROM events
        WHERE timestamp > now() - INTERVAL 24 HOUR
          AND coalesce(properties.internal_user, false) = false
          AND coalesce(properties.$host, '') <> ''
          AND coalesce(properties.$host, '') NOT LIKE '%localhost%'
          AND coalesce(properties.$host, '') NOT LIKE '%127.0.0.1%'
          AND coalesce(properties.$host, '') NOT LIKE '%[::]%'
        GROUP BY site, host
        ORDER BY pageviews DESC
    """)

    # 2. Section breakdown for portfolio
    sections = query("""
        SELECT
            properties.building AS section,
            count() AS clicks,
            uniq(distinct_id) AS visitors
        FROM events
        WHERE event = 'building_viewed'
          AND timestamp > now() - INTERVAL 24 HOUR
          AND properties.$host = 'cliffchew84.github.io'
          AND coalesce(properties.internal_user, false) = false
        GROUP BY section
        ORDER BY clicks DESC
    """)

    # 3. Link clicks for portfolio
    links = query("""
        SELECT
            properties.entry_title AS entry,
            properties.link_host AS host,
            count() AS clicks,
            uniq(distinct_id) AS visitors
        FROM events
        WHERE event = 'link_clicked'
          AND timestamp > now() - INTERVAL 24 HOUR
          AND properties.$host = 'cliffchew84.github.io'
          AND coalesce(properties.internal_user, false) = false
        GROUP BY entry, host
        ORDER BY clicks DESC
        LIMIT 10
    """)

    # Singapore time
    sgt = datetime.now(timezone.utc) + timedelta(hours=8)
    date_str = sgt.strftime("%d %b, %H:%M SGT")

    # Build message
    lines = []
    lines.append(f"<b>Portfolio · {date_str}</b>")
    lines.append("<i>Last 24 hours</i>")
    lines.append("")

    has_data = False
    for s in sites:
        site, host, pv, vis, sc, lc = s
        if pv == 0 and sc == 0 and lc == 0:
            continue
        has_data = True
        label = site_label(site, host)
        lines.append(f"<b>{label}</b> ({host})")
        lines.append(f"Views: {pv} · Visitors: {vis}")
        if sc > 0:
            sec_lines = [f"{sec[0]} {sec[1]}" for sec in sections if sec[1] > 0]
            if sec_lines:
                lines.append("Sections: " + ", ".join(sec_lines))
        if lc > 0:
            link_lines = [f"{ln[0]} → {ln[1]} ({ln[2]})" for ln in links if ln[2] > 0]
            if link_lines:
                lines.append("Links: " + "; ".join(link_lines))
        lines.append("")

    if not has_data:
        lines.append("<i>No public activity in the last 24 hours.</i>")

    text = "\n".join(lines)

    # Send to Telegram
    payload = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    })
    result = subprocess.run([
        "curl", "-s", "-X", "POST",
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        "-H", "Content-Type: application/json",
        "-d", payload
    ], capture_output=True, text=True, timeout=15)

    try:
        resp = json.loads(result.stdout)
        if not resp.get("ok"):
            print(f"Telegram error: {resp}", file=sys.stderr)
            return 1
        print(f"Sent: message_id {resp['result']['message_id']}")
        return 0
    except Exception as e:
        print(f"Failed to parse response: {e}", file=sys.stderr)
        print(f"stdout: {result.stdout}", file=sys.stderr)
        print(f"stderr: {result.stderr}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())