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


def main() -> None:
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

        total_inserted = 0

        for year in range(START_YEAR, END_YEAR + 1):
            season_start = datetime(
                year,
                START_MONTH,
                1,
                tzinfo=timezone.utc,
            )

            season_end = datetime(
                year,
                END_MONTH + 1,
                1,
                tzinfo=timezone.utc,
            )

            current = season_start
            year_inserted = 0

            print(
                f"\nBackfilling {year}...",
                flush=True,
            )

            while current < season_end:
                next_chunk = min(
                    current + timedelta(days=CHUNK_DAYS),
                    season_end,
                )

                try:
                    inserted = backfill_observations(
                        db=db,
                        station=station,
                        start_time=current,
                        end_time=next_chunk - timedelta(seconds=1),
                    )
                except Exception as exc:
                    db.rollback()

                    print(
                        f"FAILED "
                        f"{current.date()} - "
                        f"{(next_chunk - timedelta(days=1)).date()}: "
                        f"{exc}",
                        flush=True,
                    )

                    current = next_chunk
                    continue

                year_inserted += inserted
                total_inserted += inserted

                print(
                    f"{current.date()} - "
                    f"{(next_chunk - timedelta(days=1)).date()}: "
                    f"{inserted} inserted",
                    flush=True,
                )

                current = next_chunk

            print(
                f"{year}: {year_inserted} observations inserted",
                flush=True,
            )

        print(
            f"\nBackfill complete. Total inserted: {total_inserted}",
            flush=True,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
