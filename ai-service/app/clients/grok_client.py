import json
import logging

import httpx

from app.core.config import get_settings
from app.core.errors import ApiError

logger = logging.getLogger("ai-service")

_TIMEOUT = httpx.Timeout(60.0)


async def complete_json(system: str, user: str, *, model: str | None = None) -> dict:
    """Call Grok's OpenAI-compatible chat completions endpoint and return parsed
    JSON. Used by the recommendation features (spec 02). One retry on transient
    429/5xx. Never logs the API key.
    """
    settings = get_settings()
    if not settings.grok_api_key:
        raise ApiError(502, "AI service is not configured")

    payload = {
        "model": model or settings.grok_text_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.grok_api_key}"}
    url = f"{settings.grok_base_url.rstrip('/')}/chat/completions"

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for attempt in range(2):
            try:
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code in (429, 500, 502, 503, 504) and attempt == 0:
                    continue
                res.raise_for_status()
                content = res.json()["choices"][0]["message"]["content"]
                return json.loads(content)
            except (httpx.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt == 0:
                    continue
                break

    logger.error("Grok call failed: %s", last_error)
    raise ApiError(502, "AI service unavailable")
