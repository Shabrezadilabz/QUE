# que-airflow-operator

Install the Que job-run operator in Apache Airflow.

## Install

```bash
# From this repo (monorepo path)
pip install ./schemagraph/api/exporters/airflow

# Or copy que_job_run_operator.py into airflow/plugins/
```

## Airflow connection

Create connection **`que_api`**:

| Field | Value |
|-------|--------|
| Login | Your Que workspace UUID |
| Password | API key with `job.run` scope |

Set Airflow variable **`que_api_base`** = `https://your-que-api.example`

## Example DAG

See [example_dag.py](./example_dag.py).

## API used

- `POST /workspaces/:workspaceId/jobs/:jobId/run` — start run
- `GET /workspaces/:workspaceId/jobs/:jobId/runs` — poll when `wait=True`

## Orchestrator webhook (optional)

Que can also **call** your orchestrator when jobs complete (Settings → Orchestrator).
Use the operator when **Airflow drives Que**, not the other way around.
