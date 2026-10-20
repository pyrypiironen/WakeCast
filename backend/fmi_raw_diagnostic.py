"""Read-only WakeCast FMI forecast diagnostic.

Run with Python 3.11+ and httpx installed:
    python fmi_raw_diagnostic.py
    python fmi_raw_diagnostic.py --samples 6 --interval 600

This script makes exactly one FMI WFS request per sample. It does not modify
WakeCast files, local database, or API. Optional --save-dir saves raw replies.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta
import math
from pathlib import Path
import time
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

import httpx

URL = "https://opendata.fmi.fi/wfs"
QUERY = "fmi::forecast::edited::weather::scandinavia::point::multipointcoverage"
LATITUDE = 60.16905
LONGITUDE = 24.833173
LOCAL_TIMEZONE = ZoneInfo("Europe/Helsinki")

NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "gmlcov": "http://www.opengis.net/gmlcov/1.0",
    "swe": "http://www.opengis.net/swe/2.0",
}

FIELD_MAP = {
    "Temperature": "temperature",
    "WindSpeedMS": "wind_speed",
    "HourlyMaximumGust": "wind_gust",
    "WindDirection": "wind_direction",
    "Precipitation1h": "precipitation",
    "PoP": "precipitation_probability",
    "TotalCloudCover": "cloudiness",
}
REQUIRED = [name for name, target in FIELD_MAP.items() if target != "precipitation_probability"]


def parse_raw_rows(xml: str) -> dict[datetime, dict[str, str]]:
    root = ET.fromstring(xml)
    names = [
        el.get("name", "")
        for el in root.findall(".//gmlcov:rangeType/swe:DataRecord/swe:field", NS)
    ]
    positions = root.findall(".//gmlcov:positions", NS)
    value_lists = root.findall(".//gml:doubleOrNilReasonTupleList", NS)
    if not names or len(positions) != 1 or len(value_lists) != 1:
        raise ValueError("Unexpected FMI coverage format or FMI error response")

    triples = (positions[0].text or "").split()
    value_rows = [line.split() for line in (value_lists[0].text or "").splitlines() if line.strip()]
    if len(triples) % 3 or len(value_rows) != len(triples) // 3:
        raise ValueError("Invalid FMI positions or row count")
    if any(len(values) != len(names) for values in value_rows):
        raise ValueError("Invalid FMI value field count")

    rows = {}
    for index, values in enumerate(value_rows):
        unix_seconds = float(triples[3 * index + 2])
        hour = datetime.fromtimestamp(unix_seconds, UTC)
        rows[hour] = dict(zip(names, values, strict=True))
    return rows


def field_status(raw: str | None) -> str:
    if raw is None or raw == "NaN":
        return "missing"
    try:
        numeric = float(raw)
    except ValueError:
        return "invalid"
    return "ok" if math.isfinite(numeric) else "invalid"


def report_rows(rows: dict[datetime, dict[str, str]], checked_at: datetime) -> None:
    if not rows:
        print("FMI raw reply contains no forecast rows")
        return

    first = min(rows).astimezone(LOCAL_TIMEZONE)
    last = max(rows).astimezone(LOCAL_TIMEZONE)
    print(f"Raw FMI range: {first:%Y-%m-%d %H:%M %Z} through {last:%Y-%m-%d %H:%M %Z}; {len(rows)} rows")
    now_hour = checked_at.replace(minute=0, second=0, microsecond=0)

    for delta in (-1, 0, 1, 2, 3):
        hour = now_hour + timedelta(hours=delta)
        label = hour.astimezone(LOCAL_TIMEZONE).strftime("%Y-%m-%d %H:%M %Z")
        values = rows.get(hour)
        if values is None:
            print(f"{label} | RAW HOUR ABSENT — FMI did not return this timestamp")
            continue

        missing = [name for name in REQUIRED if field_status(values.get(name)) != "ok"]
        pop = values.get("PoP", "<field absent>")
        state = "WOULD BE DISCARDED BY WAKECAST" if missing else "WOULD BE KEPT BY WAKECAST"
        print(f"{label} | RAW HOUR PRESENT | {state} | PoP={pop} | missing/invalid required={missing}")
        for name, field in FIELD_MAP.items():
            raw = values.get(name, "<field absent>")
            print(f"    {field:27} {str(raw):>15}  [{field_status(values.get(name))}]")


def run_once(save_dir: Path | None) -> None:
    checked_at = datetime.now(UTC)
    print(f"\n=== FMI raw WFS check at {checked_at.astimezone(LOCAL_TIMEZONE):%Y-%m-%d %H:%M:%S %Z} ===", flush=True)
    response = httpx.get(
        URL,
        params={
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "storedquery_id": QUERY,
            "latlon": f"{LATITUDE},{LONGITUDE}",
        },
        timeout=20.0,
    )
    response.raise_for_status()
    print(
        f"HTTP {response.status_code} | Date={response.headers.get('date', '?')} | "
        f"Age={response.headers.get('age', '?')} | bytes={len(response.content)}"
    )
    if save_dir is not None:
        save_dir.mkdir(parents=True, exist_ok=True)
        target = save_dir / f"fmi_{checked_at:%Y%m%dT%H%M%SZ}.xml"
        target.write_bytes(response.content)
        print(f"Raw XML saved to {target}")

    report_rows(parse_raw_rows(response.text), checked_at)


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect raw FMI forecast hours and missing weather fields")
    parser.add_argument("--samples", type=int, default=1, help="Number of samples to collect (default 1)")
    parser.add_argument("--interval", type=int, default=600, help="Seconds between samples (default 600)")
    parser.add_argument("--save-dir", type=Path, help="Optional directory to preserve original FMI XML replies")
    args = parser.parse_args()
    if args.samples < 1 or args.interval < 1:
        parser.error("--samples and --interval must be positive")
    for index in range(args.samples):
        try:
            run_once(args.save_dir)
        except (httpx.HTTPError, ET.ParseError, ValueError) as error:
            print(f"FMI request/parse failed: {type(error).__name__}: {error}", flush=True)
        if index + 1 < args.samples:
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
