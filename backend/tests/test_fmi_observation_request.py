from datetime import datetime
from unittest.mock import Mock

import pytest

from app.services import fmi_observations


@pytest.mark.parametrize(
    "start_text, end_text",
    [
        ("2026-10-15T07:10:00+00:00", "2026-10-15T10:33:11+00:00"),
        ("2026-10-15T10:10:00+03:00", "2026-10-15T10:33:11.180721+00:00"),
        ("2026-10-15T09:10:00.123456+02:00", "2026-10-15T12:33:11.999999+02:00"),
    ],
)
def test_observation_request_uses_utc_whole_seconds(monkeypatch, start_text, end_text):
    response = Mock(text="observation XML")
    get = Mock(return_value=response)
    parse = Mock()
    monkeypatch.setattr(fmi_observations.httpx, "get", get)
    monkeypatch.setattr(fmi_observations, "parse_observations", parse)

    result = fmi_observations.get_observations(
        station_id=100971,
        start_time=datetime.fromisoformat(start_text),
        end_time=datetime.fromisoformat(end_text),
    )

    params = get.call_args.kwargs["params"]
    assert params["starttime"] == "2026-10-15T07:10:00Z"
    assert params["endtime"] == "2026-10-15T10:33:11Z"
    assert params["fmisid"] == 100971
    response.raise_for_status.assert_called_once_with()
    parse.assert_called_once_with("observation XML", station_id=100971)
    assert result is parse.return_value
