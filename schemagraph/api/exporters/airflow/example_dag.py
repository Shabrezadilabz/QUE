"""Example Airflow DAG — trigger Que stitch job after upstream load."""
from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.empty import EmptyOperator

try:
    from que_job_run_operator import QueJobRunOperator
except ImportError:
    from que_airflow_operator.que_job_run_operator import QueJobRunOperator

with DAG(
    dag_id="que_post_ingest_mart",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    tags=["que", "dbt-exit"],
) as dag:
    start = EmptyOperator(task_id="start")

    run_que_mart = QueJobRunOperator(
        task_id="que_brand_revenue_mart",
        que_api_base="{{ var.value.get('que_api_base', 'http://localhost:8787') }}",
        workspace_id="{{ conn.que_api.login }}",
        job_id="{{ var.value.que_brand_job_id }}",
        api_key="{{ conn.que_api.password }}",
        mode="dry_run",
        wait=True,
        poll_interval_sec=10,
        poll_timeout_sec=900,
    )

    start >> run_que_mart
