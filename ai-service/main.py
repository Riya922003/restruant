import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.clients.cloudinary_client import configure_cloudinary
from app.core.config import get_settings
from app.core.database import close_pool, open_pool
from app.core.errors import register_error_handlers
from app.routes import inventory_ai, invoice_ocr, meta, pricing_ai

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    open_pool()
    configure_cloudinary()
    yield
    close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="RestaurantOS AI Service", lifespan=lifespan)

    # Trailing-slash tolerant, comma-separated origins (Phase 1 CORS robustness).
    origins = [o.strip().rstrip("/") for o in settings.frontend_origin.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    register_error_handlers(app)

    app.include_router(meta.router, prefix="/ai", tags=["meta"])
    app.include_router(invoice_ocr.router, prefix="/ai/invoices", tags=["invoice-ocr"])
    app.include_router(inventory_ai.router, prefix="/ai/inventory", tags=["inventory-ai"])
    app.include_router(pricing_ai.router, prefix="/ai/menu", tags=["pricing-ai"])

    @app.get("/health")
    def health_check():
        return {"status": "ok", "service": "restaurantos-ai"}

    return app


app = create_app()
