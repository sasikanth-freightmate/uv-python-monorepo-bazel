"""Temporal worker: hosts GraphWorkflow + activities and polls the task queue.

Run inside the devcontainer (with the `temporal` service up):
    bazel run //apps/workflows:worker
"""

import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker

from apps.workflows.activities import approve, review, score, validate
from libs.workflow_engine.workflow import GraphWorkflow

TASK_QUEUE = "graph-tq"


async def main() -> None:
    address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
    client = await Client.connect(address)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[GraphWorkflow],
        activities=[validate, score, approve, review],
    )
    print(f"worker connected to {address}, polling {TASK_QUEUE!r} ...")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
