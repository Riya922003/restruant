// Mirrors the AI service response schemas (phase-02 specs 02 and 03).

export type AiContext = Record<string, number | string | boolean>;

// --- Recommendations ----------------------------------------------------------
export type ShortageItem = {
  ingredient_id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  avg_daily_usage: number;
  days_until_shortage: number | null;
  risk: "low" | "medium" | "high";
  reason: string;
};
export type ShortageResult = { at_risk: ShortageItem[]; summary?: string; context: AiContext };

export type ReorderItem = {
  item_type: "ingredient" | "product";
  item_id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  avg_daily_usage: number;
  suggested_order_qty: number;
  estimated_unit_cost: number;
  estimated_cost: number;
  supplier_id: number | null;
  reason: string;
};
export type ReorderResult = { recommendations: ReorderItem[]; context: AiContext };

export type PricingItem = {
  menu_item_id: number;
  name: string;
  unit_cost: number;
  current_price: number;
  current_margin_pct: number;
  suggested_price: number;
  suggested_margin_pct: number;
  popularity_rank: number | null;
  rationale: string;
};
export type PricingResult = { suggestions: PricingItem[]; context: AiContext };

export type PrepTimeItem = {
  menu_item_id: number;
  name: string;
  existing_prep_time_minutes: number | null;
  estimated_prep_time_minutes: number;
  confidence: "low" | "medium" | "high";
  ingredient_count: number;
  drivers: string;
};
export type PrepTimeResult = { estimates: PrepTimeItem[]; context: AiContext };

export type WasteItem = {
  item_type: "product";
  item_id: number;
  name: string;
  unit: string;
  wasted_qty: number;
  wasted_value: number;
  waste_pct_of_usage: number | null;
  likely_cause: string;
  recommendation: string;
};
export type WasteResult = { total_waste_value: number; top_waste: WasteItem[]; context: AiContext };

// --- Invoice processing -------------------------------------------------------
export type ImportStatus =
  | "uploaded" | "queued" | "processing" | "extracted" | "failed" | "approved" | "rejected";

export type InvoiceLineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
};

export type ExtractedData = {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  line_items: InvoiceLineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number | null;
  notes: string | null;
};

export type ImportRow = {
  id: number;
  batch_id: number | null;
  original_filename: string;
  mime_type: string;
  status: ImportStatus;
  extraction_confidence: number | null;
  error_message: string | null;
  matched_supplier_id: number | null;
  matched_supplier_name: string | null;
  created_invoice_id: number | null;
  file_url: string | null;
  created_at: string;
};

export type ImportDetail = ImportRow & { extracted_data: ExtractedData | null };

export type UploadResult = {
  batch_id: number;
  imports: { id: number; original_filename: string; status: ImportStatus }[];
};
