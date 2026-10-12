from datetime import datetime, timezone

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.services.weather_scheduler import (
    cleanup_all_active_weather_stations,
    refresh_all_active_parks,
    refresh_all_active_weather_stations,
    refresh_all_active_water_temperature_stations,
    scheduler,
)


def test_scheduler_registers_expected_jobs():
    jobs = {job.id: job for job in scheduler.get_jobs()}

    assert set(jobs) == {
        "refresh_weather_forecasts",
        "refresh_weather_observations",
        "cleanup_weather_observations",
        "refresh_water_temperatures",
    }


def test_forecast_refresh_interval():
    job = scheduler.get_job("refresh_weather_forecasts")

    assert job.func is refresh_all_active_parks
    assert isinstance(job.trigger, IntervalTrigger)
    assert job.trigger.interval.total_seconds() == 15 * 60


def test_observation_refresh_interval():
    job = scheduler.get_job("refresh_weather_observations")

    assert job.func is refresh_all_active_weather_stations
    assert isinstance(job.trigger, IntervalTrigger)
    assert job.trigger.interval.total_seconds() == 10 * 60


def test_observation_cleanup_schedule():
    job = scheduler.get_job("cleanup_weather_observations")

    assert job.func is cleanup_all_active_weather_stations
    assert isinstance(job.trigger, CronTrigger)

    # Check the next scheduled run from a known UTC timestamp.
    now = datetime(2026, 10, 10, 4, tzinfo=timezone.utc)
    next_run = job.trigger.get_next_fire_time(None, now)

    assert next_run == datetime(
        2026, 10, 11, 3, tzinfo=timezone.utc
    )


def test_water_temperature_refresh_interval():
    job = scheduler.get_job("refresh_water_temperatures")

    assert job.func is refresh_all_active_water_temperature_stations
    assert isinstance(job.trigger, IntervalTrigger)
    assert job.trigger.interval.total_seconds() == 30 * 60

