from copy import deepcopy
from datetime import UTC, datetime
from functools import wraps
from threading import Lock


class WeatherJobMonitor:
    def __init__(self):
        self._lock = Lock()
        self._jobs = {}

    def register(self, job_id):
        with self._lock:
            self._jobs.setdefault(
                job_id,
                {
                    "status": "never_run",
                    "started_at": None,
                    "finished_at": None,
                    "last_successful_run_at": None,
                    "result": None,
                    "error_type": None,
                },
            )

    def snapshot(self):
        with self._lock:
            return deepcopy(self._jobs)

    def run(self, job_id, operation, *args, **kwargs):
        self.register(job_id)

        with self._lock:
            self._jobs[job_id].update(
                status="running",
                started_at=datetime.now(UTC),
                finished_at=None,
                result=None,
                error_type=None,
            )

        try:
            result = operation(*args, **kwargs)
        except Exception as exc:
            with self._lock:
                self._jobs[job_id].update(
                    status="failed",
                    finished_at=datetime.now(UTC),
                    error_type=type(exc).__name__,
                )
            raise

        if result["failed"]:
            status = "partial" if result["succeeded"] else "failed"
        elif result["skipped"]:
            status = "partial" if result["succeeded"] else "skipped"
        elif result["succeeded"]:
            status = "succeeded"
        else:
            status = "no_items"

        finished_at = datetime.now(UTC)

        with self._lock:
            state = self._jobs[job_id]
            state.update(
                status=status,
                finished_at=finished_at,
                result=dict(result),
            )

            if status == "succeeded":
                state["last_successful_run_at"] = finished_at

        return result

    def track(self, job_id):
        def decorator(operation):
            self.register(job_id)

            @wraps(operation)
            def wrapped(*args, **kwargs):
                return self.run(job_id, operation, *args, **kwargs)

            return wrapped

        return decorator


job_monitor = WeatherJobMonitor()
