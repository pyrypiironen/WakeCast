# WakeCast

## Manual weather refresh

`POST /api/parks/{slug}/weather/refresh` requires an `X-API-Key` header
matching the backend's `WEATHER_REFRESH_API_KEY` environment variable.
The endpoint returns **403** for a missing or incorrect header. If the
environment variable is unset, empty, or whitespace-only, manual refresh
is disabled and returns **503**. Authentication runs before database access
or weather fetching. Public GET endpoints and scheduled refreshes do not
require this key.

Generate a secret locally:

```bash
python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Set `WEATHER_REFRESH_API_KEY` in the backend process environment or your
deployment's secret settings. `backend/.env.example` documents the variable;
the application does not automatically load `.env` files. For local use,
start the backend with an environment file explicitly:

```bash
cd backend
uvicorn app.main:app --reload --env-file .env
```

In a shell where `WEATHER_REFRESH_API_KEY` is set, call the endpoint:

```bash
curl -X POST 'http://127.0.0.1:8000/api/parks/laguuni-keilis/weather/refresh' -H "X-API-Key: ${WEATHER_REFRESH_API_KEY}"
```

Use HTTPS for remote requests. Keep the actual key out of Git, URLs, logs,
and frontend code. Swagger UI at `/docs` exposes an Authorize button for
the header; use it only in a trusted session.

Run the backend tests from `backend`:

```bash
python -m pytest -v -ra
```

The existing database integration tests require a local PostgreSQL database
named `wakecast_test`, accessible as `pyry`. The authentication tests in
`tests/test_refresh_security.py` run without a database server.
