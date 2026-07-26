from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def ok(data: Any, meta: Any | None = None, status_code: int = 200) -> JSONResponse:
    """Success envelope matching Phase 1: { data, meta? }."""
    body: dict = {"data": jsonable_encoder(data)}
    if meta is not None:
        body["meta"] = jsonable_encoder(meta)
    return JSONResponse(status_code=status_code, content=body)


def created(data: Any) -> JSONResponse:
    return ok(data, status_code=201)
