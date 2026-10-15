from datetime import UTC, datetime, timedelta
from unittest.mock import Mock
from zoneinfo import ZoneInfo

import pytest

from app.services import ecmwf


@pytest.mark.parametrize("start_date", ["2026-03-19", "2026-10-15"])
def test_request_covers_tenth_local_day_including_dst(monkeypatch, start_date):
    start = datetime.fromisoformat(start_date).replace(tzinfo=UTC)

    def fake_get(url, *, params, timeout):
        assert url == ecmwf.OPEN_METEO_ECMWF_URL
        assert params["forecast_days"] == 11
        assert params["timezone"] == "UTC"
        assert params["wind_speed_unit"] == "ms"
        assert params["latitude"] == 60.16905
        assert params["longitude"] == 24.833173
        assert timeout == 30.0
        count = params["forecast_days"] * 24
        hourly = {
            "time": [
                (start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M")
                for i in range(count)
            ],
            **{field: [1.0] * count for field in ecmwf.ECMWF_FIELD_MAP},
        }
        response = Mock()
        response.json.return_value = {"hourly": hourly}
        return response

    monkeypatch.setattr(ecmwf.httpx, "get", fake_get)
    result = ecmwf.get_ecmwf_forecast(60.16905, 24.833173)
    assert len(result.forecasts) == 264
    zone = ZoneInfo("Europe/Helsinki")
    target = start.date() + timedelta(days=10)
    local_start = datetime.combine(target, datetime.min.time(), tzinfo=zone)
    local_end = datetime.combine(
        target + timedelta(days=1), datetime.min.time(), tzinfo=zone
    )
    expected = []
    current = local_start.astimezone(UTC)
    while current < local_end.astimezone(UTC):
        expected.append(current)
        current += timedelta(hours=1)
    actual = [
        p for p in result.forecasts if p.timestamp.astimezone(zone).date() == target
    ]
    assert [p.timestamp for p in actual] == expected
    assert len(actual) == (23 if start_date == "2026-03-19" else 25)
    assert all(p.precipitation_probability is None for p in actual)
    assert all(p.source == "ecmwf" for p in actual)
