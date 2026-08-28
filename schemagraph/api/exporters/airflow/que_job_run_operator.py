"""
Que Airflow operator — trigger Que job runs from your DAG (S4.2).

Install:
  pip install que-airflow-operator
  # or: pip install git+https://github.com/Shabrezadilabz/QUE.git#subdirectory=schemagraph/api/exporters/airflow

Requires:
  - Que API key with job.run scope (Settings → API keys)
  - Airflow Connection ``que_api`` (login=workspace_id, password=api_key)
    or pass que_api_base / api_key explicitly.

Usage:
  from que_airflow_operator import QueJobRunOperator

  run_que = QueJobRunOperator(
      task_id="que_brand_revenue_mart",
      que_api_base="https://api.que.example",
      workspace_id="{{ var.value.que_workspace_id }}",
      job_id="{{ var.value.que_brand_job_id }}",
      api_key="{{ conn.que_api.password }}",
      mode="dry_run",
      wait=True,
  )
"""
from __future__ import annotations

import json
import time
from typing import Any

try:
    from airflow.models import BaseOperator
except ImportError:  # pragma: no cover
    BaseOperator = object  # type: ignore


class QueJobRunOperator(BaseOperator):
    """POST job run; optionally poll GET /jobs/:id/runs until terminal status."""

    template_fields = (
        "workspace_id",
        "job_id",
        "que_api_base",
        "api_key",
        "mode",
    )

    def __init__(
        self,
        *,
        que_api_base: str,
        workspace_id: str,
        job_id: str,
        api_key: str,
        mode: str = "dry_run",
        wait: bool = False,
        poll_interval_sec: int = 5,
        poll_timeout_sec: int = 600,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.que_api_base = que_api_base.rstrip("/")
        self.workspace_id = workspace_id
        self.job_id = job_id
        self.api_key = api_key
        self.mode = mode
        self.wait = wait
        self.poll_interval_sec = poll_interval_sec
        self.poll_timeout_sec = poll_timeout_sec

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        import urllib.error
        import urllib.request

        url = f"{self.que_api_base}{path}"
        data = json.dumps(body or {}).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Que API {method} {path} failed ({exc.code}): {detail[:500]}"
            ) from exc

    def _poll_run(self, run_id: str) -> dict:
        deadline = time.time() + self.poll_timeout_sec
        path = (
            f"/workspaces/{self.workspace_id}/jobs/{self.job_id}/runs"
        )
        while time.time() < deadline:
            payload = self._request("GET", path)
            runs = payload.get("runs") or []
            hit = next((r for r in runs if r.get("id") == run_id), runs[0] if runs else None)
            if hit and hit.get("status") in ("completed", "failed", "cancelled"):
                if hit.get("status") != "completed":
                    raise RuntimeError(
                        f"Que job run {run_id} ended with status {hit.get('status')}"
                    )
                return hit
            time.sleep(self.poll_interval_sec)
        raise TimeoutError(
            f"Que job run {run_id} did not finish within {self.poll_timeout_sec}s"
        )

    def execute(self, context: dict) -> dict:
        path = (
            f"/workspaces/{self.workspace_id}/jobs/{self.job_id}/run"
        )
        payload = self._request("POST", path, {"mode": self.mode})
        run = payload.get("run") or {}
        run_id = run.get("id")
        self.log.info("Que job run started: %s status=%s", run_id, run.get("status"))
        if self.wait and run_id:
            run = self._poll_run(run_id)
            self.log.info("Que job run completed: %s", run_id)
        return payload
