const { z } = require("zod");

const PO_STATUSES = ["draft", "ordered", "partially_received", "received", "cancelled"];

const nonEmpty = (data) => Object.keys(data).length > 0;
const nonEmptyMsg = { message: "At least one field is required" };

const itemInputSchema = z
  .object({
    product_id: z.coerce.number().int().positive(),
    quantity_ordered: z.coerce.number().positive(),
    unit_cost: z.coerce.number().min(0),
  })
  .strict();

const createSchema = z
  .object({
    supplier_id: z.coerce.number().int().positive(),
    warehouse_id: z.coerce.number().int().positive(),
    order_date: z.coerce.date().optional().nullable(),
    expected_date: z.coerce.date().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(itemInputSchema).min(1),
  })
  .strict();

const updateSchema = z
  .object({
    supplier_id: z.coerce.number().int().positive().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    order_date: z.coerce.date().optional().nullable(),
    expected_date: z.coerce.date().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    status: z.enum(PO_STATUSES).optional(),
  })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

const addItemSchema = itemInputSchema;

const updateItemSchema = itemInputSchema
  .partial()
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

const receiveSchema = z
  .object({
    lines: z
      .array(
        z.object({
          item_id: z.coerce.number().int().positive(),
          quantity: z.coerce.number().positive(),
        })
      )
      .min(1),
    received_date: z.coerce.date().optional(),
  })
  .strict();

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    warehouse_id: z.coerce.number().int().positive().optional(),
    status: z.enum(PO_STATUSES).optional(),
  })
  .strip();

module.exports = {
  PO_STATUSES,
  itemInputSchema,
  createSchema,
  updateSchema,
  addItemSchema,
  updateItemSchema,
  receiveSchema,
  querySchema,
};
