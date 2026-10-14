from unittest.mock import Mock

import pytest

from app.services.weather_job_monitor import WeatherJobMonitor


@pytest.mark.parametrize(
    ("result", "expected_status"),
    [
        (
            {"succeeded": 2, "failed": 0, "skipped": 0},
            "succeeded",
        ),
        (
            {"succeeded": 1, "failed": 1, "skipped": 0},
            "partial",
        ),
        (
            {"succeeded": 0, "failed": 1, "skipped": 0},
            "failed",
        ),
        (
            {"succeeded": 0, "failed": 0, "skipped": 1},
            "skipped",
        ),
        (
            {"succeeded": 1, "failed": 0, "skipped": 1},
            "partial",
        ),
        (
            {"succeeded": 0, "failed": 0, "skipped": 0},
            "no_items",
        ),
    ],
)
def test_monitor_records_run_outcomes(result, expected_status):
    monitor = WeatherJobMonitor()

    @monitor.track("test-job")
    def operation():
        running = monitor.snapshot()["test-job"]
        assert running["status"] == "running"
        assert running["started_at"] is not None
        assert running["finished_at"] is None
        return result

    initial = monitor.snapshot()["test-job"]
    assert initial["status"] == "never_run"
    assert initial["last_successful_run_at"] is None

    assert operation() == result

    state = monitor.snapshot()["test-job"]
    assert state["status"] == expected_status
    assert state["result"] == result
    assert state["started_at"] <= state["finished_at"]
    assert state["error_type"] is None

    if expected_status == "succeeded":
        assert state["last_successful_run_at"] == state["finished_at"]
    else:
        assert state["last_successful_run_at"] is None


def test_monitor_preserves_last_success_after_exception():
    monitor = WeatherJobMonitor()
    success = {"succeeded": 1, "failed": 0, "skipped": 0}

    monitor.run("test-job", Mock(return_value=success))
    previous_success = monitor.snapshot()["test-job"]["last_successful_run_at"]

    original_error = RuntimeError("Sensitive internal error details")

    with pytest.raises(RuntimeError) as caught:
        monitor.run(
            "test-job",
            Mock(side_effect=original_error),
        )

    assert caught.value is original_error

    state = monitor.snapshot()["test-job"]
    assert state["status"] == "failed"
    assert state["error_type"] == "RuntimeError"
    assert state["result"] is None
    assert state["finished_at"] is not None
    assert state["last_successful_run_at"] == previous_success
    assert "Sensitive internal error details" not in repr(state)


def test_monitor_snapshot_cannot_modify_internal_state():
    monitor = WeatherJobMonitor()
    result = {"succeeded": 1, "failed": 0, "skipped": 0}

    monitor.run("test-job", Mock(return_value=result))

    snapshot = monitor.snapshot()
    snapshot["test-job"]["status"] = "changed"
    snapshot["test-job"]["result"]["succeeded"] = 999

    actual = monitor.snapshot()["test-job"]
    assert actual["status"] == "succeeded"
    assert actual["result"]["succeeded"] == 1
