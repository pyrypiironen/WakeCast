from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock

import pytest

from app.scripts import backfill_weather_history as script


@pytest.mark.parametrize(
    (
        "failed_chunks",
        "expected_exit",
        "expected_saved",
        "expected_successful",
    ),
    [
        (set(), 0, 7, 2),
        ({0}, 1, 4, 1),
        ({1}, 1, 3, 1),
        ({0, 1}, 1, 0, 0),
    ],
)
def test_backfill_reports_chunk_results(
    monkeypatch,
    capsys,
    failed_chunks,
    expected_exit,
    expected_saved,
    expected_successful,
):
    db = MagicMock()
    station = Mock()

    db.query.return_value.filter.return_value.one.return_value = station

    monkeypatch.setattr(script, "SessionLocal", lambda: db)
    monkeypatch.setattr(script, "START_YEAR", 2026)
    monkeypatch.setattr(script, "END_YEAR", 2026)
    monkeypatch.setattr(script, "START_MONTH", 1)
    monkeypatch.setattr(script, "END_MONTH", 1)
    monkeypatch.setattr(script, "CHUNK_DAYS", 16)

    outcomes = [
        RuntimeError("Simulated chunk failure") if index in failed_chunks else saved
        for index, saved in enumerate([3, 4])
    ]
    backfill = Mock(side_effect=outcomes)
    monkeypatch.setattr(script, "backfill_observations", backfill)

    exit_code = script.main()
    output = capsys.readouterr().out

    assert exit_code == expected_exit
    assert backfill.call_count == 2
    assert db.rollback.call_count == len(failed_chunks)
    db.close.assert_called_once_with()

    first_call, second_call = backfill.call_args_list

    assert first_call.kwargs == {
        "db": db,
        "station": station,
        "start_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "end_time": datetime(2026, 1, 16, 23, 59, 59, tzinfo=timezone.utc),
    }
    assert second_call.kwargs == {
        "db": db,
        "station": station,
        "start_time": datetime(2026, 1, 17, tzinfo=timezone.utc),
        "end_time": datetime(2026, 1, 31, 23, 59, 59, tzinfo=timezone.utc),
    }

    assert (
        f"Successful chunks: {expected_successful}; "
        f"failed chunks: {len(failed_chunks)}; "
        f"total rows saved: {expected_saved}"
    ) in output
    assert "Rows saved include inserts and updates" in output

    if failed_chunks:
        assert "Backfill finished with failures" in output
        assert "Backfill completed without chunk failures." not in output

        summary = output.split("Failed ranges:", 1)[1]
        ranges = [
            "2026-01-01 - 2026-01-16",
            "2026-01-17 - 2026-01-31",
        ]

        for index, range_label in enumerate(ranges):
            assert (range_label in summary) == (index in failed_chunks)
    else:
        assert "Backfill completed without chunk failures." in output
