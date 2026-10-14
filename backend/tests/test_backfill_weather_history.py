from types import SimpleNamespace
from unittest.mock import Mock

from app.scripts import backfill_weather_history as backfill_script


def test_backfill_rolls_back_before_next_chunk(monkeypatch, capsys):
    station = SimpleNamespace(
        id=1,
        source="fmi",
        source_station_id=100971,
    )
    db = Mock()
    db.query.return_value.filter.return_value.one.return_value = station

    events = []
    db.rollback.side_effect = lambda: events.append("rollback")

    def fake_backfill(db, station, start_time, end_time):
        events.append(("backfill", start_time.day))

        if start_time.day == 1:
            raise RuntimeError("Simulated database failure")

        return 5

    monkeypatch.setattr(backfill_script, "SessionLocal", lambda: db)
    monkeypatch.setattr(
        backfill_script,
        "backfill_observations",
        fake_backfill,
    )
    monkeypatch.setattr(backfill_script, "START_YEAR", 2026)
    monkeypatch.setattr(backfill_script, "END_YEAR", 2026)
    monkeypatch.setattr(backfill_script, "START_MONTH", 5)
    monkeypatch.setattr(backfill_script, "END_MONTH", 5)
    monkeypatch.setattr(backfill_script, "CHUNK_DAYS", 16)

    exit_code = backfill_script.main()
    assert exit_code == 1

    assert events == [
        ("backfill", 1),
        "rollback",
        ("backfill", 17),
    ]
    db.rollback.assert_called_once()
    db.close.assert_called_once()

    output = capsys.readouterr().out
    assert "FAILED 2026-05-01 - 2026-05-16" in output
    assert ("Successful chunks: 1; failed chunks: 1; total rows saved: 5") in output
    assert "Backfill finished with failures" in output
