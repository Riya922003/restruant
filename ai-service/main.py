from fastapi import FastAPI

from app.routes import inventory_ai, invoice_ocr, pricing_ai

app = FastAPI(title="RestaurantOS AI Service")

app.include_router(invoice_ocr.router, prefix="/ai/invoices", tags=["invoice-ocr"])
app.include_router(inventory_ai.router, prefix="/ai/inventory", tags=["inventory-ai"])
app.include_router(pricing_ai.router, prefix="/ai/menu", tags=["pricing-ai"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "restaurantos-ai"}

