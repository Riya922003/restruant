const { z } = require("zod");

const nonEmpty = (data) => Object.keys(data).length > 0;

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];
const MOVEMENT_TYPES = ["stock_in", "stock_out", "adjustment", "wastage", "transfer"];
const DIRECTIONS = ["increase", "decrease"];

// ---- Product categories -------------------------------------------------

const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const categoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

// ---- Warehouses ---------------------------------------------------------

const warehouseCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    location: z.string().trim().max(500).optional().nullable(),
    type: z.string().trim().max(50).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const warehouseUpdateSchema = warehouseCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const warehouseQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    type: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

// ---- Products -----------------------------------------------------------

const productCreateSchema = z
  .object({
    sku: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    category_id: z.coerce.number().int().positive().optional().nullable(),
    unit: z.enum(UNITS),
    current_stock: z.coerce.number().min(0).optional(),
    reorder_level: z.coerce.number().min(0).optional(),
    cost_price: z.coerce.number().min(0).optional(),
    supplier_id: z.coerce.number().int().positive().optional().nullable(),
    warehouse_id: z.coerce.number().int().positive().optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

const productUpdateSchema = productCreateSchema
  .partial()
  .strict()
  .refine((data) => data.current_stock === undefined, {
    message: "current_stock is managed by stock movements",
    path: ["current_stock"],
  })
  .refine(nonEmpty, { message: "At least one field is required" });

const productQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    category_id: z.coerce.number().int().positive().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    low_stock: z.enum(["true", "false"]).optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

// ---- Stock movements ----------------------------------------------------

const movementCreateSchema = z
  .object({
    product_id: z.coerce.number().int().positive(),
    warehouse_id: z.coerce.number().int().positive(),
    movement_type: z.enum(MOVEMENT_TYPES),
    quantity: z.coerce.number().positive(),
    unit_cost: z.coerce.number().min(0).optional().nullable(),
    reference: z.string().trim().max(200).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
    direction: z.enum(DIRECTIONS).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.movement_type === "adjustment") {
      if (data.direction === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "direction is required for an adjustment",
          path: ["direction"],
        });
      }
      if (data.reason === undefined || data.reason === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "reason is required for an adjustment",
          path: ["reason"],
        });
      }
    }
  });

const movementQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    product_id: z.coerce.number().int().positive().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    movement_type: z.enum(MOVEMENT_TYPES).optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = {
  UNITS,
  MOVEMENT_TYPES,
  DIRECTIONS,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryQuerySchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  warehouseQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  productQuerySchema,
  movementCreateSchema,
  movementQuerySchema,
};
