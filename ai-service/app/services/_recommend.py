import json

from app.clients import grok_client


async def ask_grok(system: str, summary: dict) -> dict:
    """Send a compact business-data summary to Grok and return parsed JSON.

    The grounding rule (spec 02 section 2): the model sees only this summary and is
    told to reason strictly from it. `default=str` serializes Decimals/dates.
    """
    user = json.dumps(summary, default=str)
    return await grok_client.complete_json(system, user)
