"""Kick off one GraphWorkflow run and print the result.

Run (with the worker already running):
    bazel run //apps/workflows:starter
"""

import asyncio
import os
import uuid

from temporalio.client import Client

from apps.workflows.example_graph import build_graph
from libs.workflow_engine.workflow import GraphWorkflow

TASK_QUEUE = "graph-tq"


async def main() -> None:
    address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
    client = await Client.connect(address)
    graph = build_graph()
    handle = await client.start_workflow(
        GraphWorkflow.run,
        args=[graph, {"order_id": "demo-1"}],
        id=f"graph-demo-{uuid.uuid4().hex[:8]}",
        task_queue=TASK_QUEUE,
    )
    print(f"started workflow {handle.id}")
    result = await handle.result()
    print(f"result: {result}")


if __name__ == "__main__":
    asyncio.run(main())
