const { z } = require("zod");

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    unit: z.enum(UNITS),
    current_stock: z.coerce.number().min(0).optional(),
    reorder_level: z.coerce.number().min(0).optional(),
    cost_per_unit: z.coerce.number().min(0).optional(),
    supplier_id: z.coerce.number().int().positive().optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

const updateSchema = createSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

const adjustStockSchema = z
  .object({
    delta: z.coerce.number().refine((v) => v !== 0, {
      message: "delta must not be zero",
    }),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    low_stock: z.enum(["true", "false"]).optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

module.exports = { createSchema, updateSchema, adjustStockSchema, querySchema, UNITS };
