import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("ai-service")


class ApiError(Exception):
    """Raised by routes/services. Rendered as { message, errors? } (Phase 1 shape)."""

    def __init__(self, status_code: int, message: str, errors: list | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.errors = errors


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _handle_api_error(_req: Request, exc: ApiError):
        body: dict = {"message": exc.message}
        if exc.errors:
            body["errors"] = exc.errors
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_req: Request, exc: RequestValidationError):
        # Match Phase 1's 422 envelope: { message, errors: [{ field, message }] }.
        errors = [
            {
                "field": ".".join(str(p) for p in err.get("loc", []) if p not in ("body",)),
                "message": err.get("msg", "Invalid value"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422, content={"message": "Validation failed", "errors": errors}
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(_req: Request, exc: Exception):
        # Never leak internals (SQL, keys, paths) to the client.
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(status_code=500, content={"message": "Internal server error"})
