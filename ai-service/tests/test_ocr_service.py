def test_ocr_stub_is_normalized_without_veryfi_credentials(monkeypatch):
    from app.core.config import get_settings
    from app.services import ocr_service

    get_settings.cache_clear()
    monkeypatch.setenv("VERYFI_API_KEY", "")

    result = ocr_service.extract(b"fake", "sample invoice.jpg", "image/jpeg")

    assert result["invoice_number"] == "INV-SAMPLEINVOIC"
    assert result["confidence"] == 20.0
    assert result["total"] == 367.5
    assert "Stub extraction" in result["notes"]


def test_ocr_maps_veryfi_response_without_calling_network(monkeypatch):
    from app.core.config import get_settings
    from app.services import ocr_service

    get_settings.cache_clear()
    monkeypatch.setenv("VERYFI_API_KEY", "test-key")

    def fake_process_document(_file_bytes, _filename, _mime_type):
        return {
            "vendor": {"name": "Acme Foods"},
            "invoice_number": "A-100",
            "date": "27/07/2026",
            "due_date": "2026-08-10",
            "currency_code": "INR",
            "line_items": [
                {"description": "Rice", "quantity": "2", "price": "120.00", "total": "240 -"}
            ],
            "subtotal": "240.00",
            "tax": "12.00",
            "total": "240.00",
            "confidence": 87,
        }

    monkeypatch.setattr(ocr_service.veryfi_client, "process_document", fake_process_document)

    result = ocr_service.extract(b"fake", "invoice.jpg", "image/jpeg")

    assert result["supplier_name"] == "Acme Foods"
    assert result["invoice_date"] == "2026-07-27"
    assert result["line_items"][0]["line_total"] == 240.0
    assert result["confidence"] == 87.0
    assert result["raw"]["invoice_number"] == "A-100"


def test_ocr_infers_usd_when_veryfi_currency_code_is_missing(monkeypatch):
    from app.core.config import get_settings
    from app.services import ocr_service

    get_settings.cache_clear()
    monkeypatch.setenv("VERYFI_API_KEY", "test-key")

    def fake_process_document(_file_bytes, _filename, _mime_type):
        return {
            "vendor": {"name": "My Company"},
            "invoice_number": "0001",
            "date": "February 20, 2026",
            "due_date": "March 7, 2026",
            "currency_code": None,
            "line_items": [
                {"description": "Coffee", "quantity": "50", "price": "$10", "total": "$500"},
                {"description": "Cups", "quantity": "100", "price": "$9", "total": "$900"},
            ],
            "subtotal": "$1,400",
            "tax": "$70",
            "total": "$1,470",
        }

    monkeypatch.setattr(ocr_service.veryfi_client, "process_document", fake_process_document)

    result = ocr_service.extract(b"fake", "handwritten-invoice.png", "image/png")

    assert result["currency"] == "USD"
    assert result["total"] == 1470.0
