"""Example leaf activities. Each performs ONE idempotent side effect.

v0 simulates the effect. The real implementation either UPSERTs to a deterministic
row (you own the DB) or sends `idem_key` as an Idempotency-Key header (cooperative
API), so re-running with the same `idem_key` is a no-op by construction. Activities
are the ONLY place I/O is allowed.
"""

from temporalio import activity


@activity.defn
async def validate(inputs: dict, idem_key: str) -> dict:
    activity.logger.info("validate", extra={"idem_key": idem_key})
    order = inputs.get("__input__", {})
    return {"valid": bool(order.get("order_id"))}


@activity.defn
async def score(inputs: dict, idem_key: str) -> dict:
    activity.logger.info("score", extra={"idem_key": idem_key})
    return {"risk": "low"}


@activity.defn
async def approve(inputs: dict, idem_key: str) -> dict:
    activity.logger.info("approve", extra={"idem_key": idem_key})
    # Real impl: UPSERT order status keyed by idem_key (exactly-once side effect).
    return {"status": "approved"}


@activity.defn
async def review(inputs: dict, idem_key: str) -> dict:
    activity.logger.info("review", extra={"idem_key": idem_key})
    return {"status": "needs_review"}
