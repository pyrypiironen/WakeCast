from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.weather_db import WeatherStationDB
from app.services.weather_history import backfill_observations

START_YEAR = 2026
END_YEAR = 2026

START_MONTH = 5
END_MONTH = 10

CHUNK_DAYS = 7

STATION_SOURCE = "fmi"
STATION_SOURCE_ID = 100971


def main() -> int:
    db = SessionLocal()

    try:
        station = (
            db.query(WeatherStationDB)
            .filter(
                WeatherStationDB.source == STATION_SOURCE,
                WeatherStationDB.source_station_id == STATION_SOURCE_ID,
            )
            .one()
        )

        total_saved = 0
        successful_chunks = 0
        failed_ranges = []

        for year in range(START_YEAR, END_YEAR + 1):
            season_start = datetime(
                year,
                START_MONTH,
                1,
                tzinfo=timezone.utc,
            )

            if END_MONTH == 12:
                season_end = datetime(
                    year + 1,
                    1,
                    1,
                    tzinfo=timezone.utc,
                )
            else:
                season_end = datetime(
                    year,
                    END_MONTH + 1,
                    1,
                    tzinfo=timezone.utc,
                )

            current = season_start
            year_saved = 0

            print(
                f"\nBackfilling {year}...",
                flush=True,
            )

            while current < season_end:
                next_chunk = min(
                    current + timedelta(days=CHUNK_DAYS),
                    season_end,
                )
                chunk_end = next_chunk - timedelta(seconds=1)
                range_label = f"{current.date()} - {chunk_end.date()}"

                try:
                    saved = backfill_observations(
                        db=db,
                        station=station,
                        start_time=current,
                        end_time=chunk_end,
                    )
                except Exception as exc:
                    db.rollback()
                    failed_ranges.append(range_label)

                    print(
                        f"FAILED {range_label}: {type(exc).__name__}",
                        flush=True,
                    )
                else:
                    successful_chunks += 1
                    year_saved += saved
                    total_saved += saved

                    print(
                        f"{range_label}: {saved} rows saved",
                        flush=True,
                    )

                current = next_chunk

            print(
                f"{year}: {year_saved} rows saved",
                flush=True,
            )

        print(
            "\nRows saved include inserts and updates; "
            "they are not a count of newly inserted observations.",
            flush=True,
        )
        print(
            f"Successful chunks: {successful_chunks}; "
            f"failed chunks: {len(failed_ranges)}; "
            f"total rows saved: {total_saved}",
            flush=True,
        )

        if failed_ranges:
            print(
                "Backfill finished with failures. Failed ranges:",
                flush=True,
            )

            for range_label in failed_ranges:
                print(f"  {range_label}", flush=True)

            return 1

        print("Backfill completed without chunk failures.", flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
