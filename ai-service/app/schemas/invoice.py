from pydantic import BaseModel


class LineItem(BaseModel):
    description: str
    quantity: float | None = None
    unit_price: float | None = None
    line_total: float | None = None


class ExtractedData(BaseModel):
    supplier_name: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    currency: str | None = None
    line_items: list[LineItem] = []
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    confidence: float | None = None
    notes: str | None = None


class PatchImport(BaseModel):
    extracted_data: ExtractedData | None = None
    original_filename: str | None = None


class ApproveRequest(BaseModel):
    supplier_id: int | None = None
    create_expense_record: bool = True
