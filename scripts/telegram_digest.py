#!/usr/bin/env python3
"""Daily Telegram digest for PostHog analytics.

For each site, the digest shows:
  1. views and visitors in the last 24 hours, with the change from the day before
  2. the top 5 events, with the parameters those events carry

No site is hardcoded. A new host gets the same detail as an old one.

Run locally without sending:

    python3 scripts/telegram_digest.py --dry-run

Environment:
    POSTHOG_API_KEY     Personal API key, read scope (phx_...)
    POSTHOG_PROJECT_ID  Project id, a number
    TELEGRAM_BOT_TOKEN  Bot token from BotFather
    TELEGRAM_CHAT_ID    Target chat id
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape

POSTHOG_HOST = "https://us.posthog.com"

# Real visits only: no local traffic, no marked internal users.
PUBLIC_ONLY = """
      AND coalesce(properties.internal_user, false) = false
      AND coalesce(properties.$host, '') <> ''
      AND coalesce(properties.$host, '') NOT LIKE '%localhost%'
      AND coalesce(properties.$host, '') NOT LIKE '%127.0.0.1%'
      AND coalesce(properties.$host, '') NOT LIKE '%[::]%'
"""

# Automatic events that carry no product meaning on their own.
NOISE_EVENTS = (
    "$pageview",
    "$pageleave",
    "$web_vitals",
    "$autocapture",
    "$identify",
    "$rageclick",
    "$dead_click",
    "$copy_autocapture",
)

# A friendly name for a host. Any other host shows its own name.
LABELS = {
    "cliffchew84.github.io": "Portfolio",
    "www.cliffchew84.github.io": "Portfolio",
    "singapore-hdb-resale.vercel.app": "HDB dashboard",
}

# Parameters that identify the sender or repeat the site itself, not the action.
NOISE_PARAMS = {"distinct_id", "app", "site", "internal_user", "token", "session_id"}

# Telegram rejects a message over 4096 characters. Pack under a lower limit so
# the split happens at a site boundary, never mid-sentence.
MAX_MESSAGE_CHARS = 3800

MAX_EVENTS = 5
MAX_PARAMS = 3
MAX_VALUES = 2
MAX_VALUE_LEN = 40


def query(sql: str) -> list:
    """Run a HogQL query and return the rows."""
    api_key = os.environ["POSTHOG_API_KEY"]
    project_id = os.environ["POSTHOG_PROJECT_ID"]
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}).encode()
    request = urllib.request.Request(
        f"{POSTHOG_HOST}/api/projects/{project_id}/query/",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response).get("results", [])


def esc(value) -> str:
    """Escape a value for the Telegram HTML parse mode."""
    return escape(str(value), quote=False)


def sq(value: str) -> str:
    """Quote a value for a HogQL string literal."""
    return value.replace("'", "''")


def num(value) -> int:
    return int(value or 0)


def label_for(host: str) -> str:
    if host in LABELS:
        return LABELS[host]
    if "hdb" in host.lower():
        return "HDB dashboard"
    return host


def delta(now: int, before: int) -> str:
    """Compact change marker: ▲12, ▼3, or · for no change."""
    diff = now - before
    if diff > 0:
        return f"▲{diff}"
    if diff < 0:
        return f"▼{abs(diff)}"
    return "·"


def unit(count: int, singular: str) -> str:
    """'1 view' or '2 views'."""
    return f"{count} {singular}" if count == 1 else f"{count} {singular}s"


def site_rows() -> dict:
    """Views and visitors for the last 24 hours and the 24 hours before."""
    rows = query(
        f"""
        SELECT
            coalesce(properties.$host, '') AS host,
            sum(if(event = '$pageview' AND timestamp > now() - INTERVAL 24 HOUR, 1, 0)) AS views,
            sum(if(event = '$pageview' AND timestamp <= now() - INTERVAL 24 HOUR, 1, 0)) AS views_prev,
            uniq(if(event = '$pageview' AND timestamp > now() - INTERVAL 24 HOUR, distinct_id, NULL)) AS visitors,
            uniq(if(event = '$pageview' AND timestamp <= now() - INTERVAL 24 HOUR, distinct_id, NULL)) AS visitors_prev,
            count() AS actions
        FROM events
        WHERE timestamp > now() - INTERVAL 48 HOUR
{PUBLIC_ONLY}
        GROUP BY host
        ORDER BY views DESC
        """
    )
    return {row[0]: row for row in rows}


def as_dict(raw) -> dict:
    """HogQL may return a JSON object or its string form."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def show_value(value) -> str:
    """Short, readable form of one parameter value."""
    if isinstance(value, list):
        text = ", ".join(str(item) for item in value[:3])
        if len(value) > 3:
            text += f" +{len(value) - 3}"
    elif isinstance(value, dict):
        text = json.dumps(value, separators=(",", ":"))
    elif isinstance(value, bool):
        text = "true" if value else "false"
    else:
        text = str(value)
    text = " ".join(text.split())
    return text if len(text) <= MAX_VALUE_LEN else text[: MAX_VALUE_LEN - 1] + "…"


def top_events(host: str) -> list:
    """The 5 busiest product events for a host, each with its own parameters.

    Returns [(event, count, [(param, [values...]), ...]), ...].
    """
    quoted = sq(host)
    top = query(
        f"""
        SELECT event, count() AS n
        FROM events
        WHERE timestamp > now() - INTERVAL 24 HOUR
          AND properties.$host = '{quoted}'
{PUBLIC_ONLY}
          AND event NOT IN {NOISE_EVENTS}
        GROUP BY event
        ORDER BY n DESC
        LIMIT {MAX_EVENTS}
        """
    )
    if not top:
        return []

    names = ", ".join(f"'{sq(name)}'" for name, _ in top)
    samples = query(
        f"""
        SELECT event, properties
        FROM events
        WHERE timestamp > now() - INTERVAL 24 HOUR
          AND properties.$host = '{quoted}'
{PUBLIC_ONLY}
          AND event IN ({names})
        ORDER BY timestamp DESC
        LIMIT 300
        """
    )

    # event -> param -> {value: count}
    seen: dict = {}
    for event, raw in samples:
        props = as_dict(raw)
        per_event = seen.setdefault(event, {})
        for key, value in props.items():
            if key.startswith("$") or key in NOISE_PARAMS or value in (None, "", [], {}):
                continue
            per_event.setdefault(key, {})
            label = show_value(value)
            per_event[key][label] = per_event[key].get(label, 0) + 1

    result = []
    for event, count in top:
        params = []
        per_event = seen.get(event, {})
        # The busiest parameters first; at most MAX_PARAMS of them.
        for key, values in sorted(
            per_event.items(), key=lambda item: sum(item[1].values()), reverse=True
        )[:MAX_PARAMS]:
            ranked = sorted(values.items(), key=lambda item: item[1], reverse=True)[:MAX_VALUES]
            if len(ranked) == 1:
                # Only one value, so a count would repeat the event count. Drop it.
                params.append((key, [esc(ranked[0][0])]))
            else:
                params.append((key, [f"{esc(name)} {n}" for name, n in ranked]))
        result.append((event, num(count), params))
    return result


def site_block(host: str, row: list) -> str | None:
    """One site's part of the digest. None when the site is quiet."""
    _, views, views_prev, visitors, visitors_prev, actions = row
    if num(views) == 0 and num(visitors) == 0 and num(actions) == 0:
        return None

    lines = [
        f"<b>{esc(label_for(host))}</b>",
        f"<i>{esc(host)}</i>",
        f"{unit(num(views), 'view').capitalize()} ({delta(num(views), num(views_prev))}) · "
        f"{unit(num(visitors), 'visitor')} ({delta(num(visitors), num(visitors_prev))})",
    ]

    for index, (event, count, params) in enumerate(top_events(host), start=1):
        if params:
            joined = " · ".join(f"{esc(key)}: {', '.join(values)}" for key, values in params)
            lines.append(f"{index}. {esc(event)} ({count}) | {joined}")
        else:
            lines.append(f"{index}. {esc(event)} ({count})")

    return "\n".join(lines)


def build_messages(sites: dict) -> list:
    """One message per group of sites that fits, so nothing is cut off."""
    sgt = datetime.now(timezone.utc) + timedelta(hours=8)
    title = f"Daily digest · {sgt.strftime('%d %b %Y')}"
    subtitle = "Last 24 hours, Singapore time. Δ is the change from the day before."

    blocks = []
    seen_labels = set()
    for host, row in sites.items():
        if label_for(host) in seen_labels:
            continue
        block = site_block(host, row)
        if block:
            blocks.append(block)
            seen_labels.add(label_for(host))

    if not blocks:
        blocks = ["<i>No public activity in the last 24 hours.</i>"]

    # A message may hold several sites. Split only when the next site would
    # push the text past the limit, so a normal day stays one message.
    budget = MAX_MESSAGE_CHARS - len(title) - len(subtitle) - 20
    groups: list = []
    current: list = []
    for block in blocks:
        if current and len("\n\n".join(current + [block])) > budget:
            groups.append(current)
            current = [block]
        else:
            current.append(block)
    if current:
        groups.append(current)

    messages = []
    for index, group in enumerate(groups, start=1):
        suffix = f" ({index}/{len(groups)})" if len(groups) > 1 else ""
        head = f"<b>{title}{suffix}</b>\n<i>{subtitle}</i>"
        messages.append(head + "\n\n" + "\n\n".join(group))
    return messages


def send(text: str) -> int:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    body = json.dumps(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
    ).encode()
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        print(f"Telegram error: {error.read().decode()}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - report and fail the job
        print(f"Telegram request failed: {error}", file=sys.stderr)
        return 1

    if not payload.get("ok"):
        print(f"Telegram error: {payload}", file=sys.stderr)
        return 1
    print(f"Sent: message_id {payload['result']['message_id']}")
    return 0


def main() -> int:
    messages = build_messages(site_rows())

    if "--dry-run" in sys.argv:
        print("\n\n--- next message ---\n\n".join(messages))
        return 0

    status = 0
    for index, message in enumerate(messages):
        if index:
            time.sleep(1)  # Telegram allows about one message per second per chat.
        status |= send(message)
    return status


if __name__ == "__main__":
    sys.exit(main())
