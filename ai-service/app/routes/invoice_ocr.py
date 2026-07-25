from fastapi import APIRouter

router = APIRouter()


@router.post("/process")
def process_invoice():
    return {"status": "pending", "module": "invoice_ocr"}

