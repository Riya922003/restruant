const { z } = require("zod");

const INVOICE_STATUSES = ["pending", "verified", "paid", "disputed"];
const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];

const nonEmpty = (data) => Object.keys(data).length > 0;
const nonEmptyMsg = { message: "At least one field is required" };

const itemSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    product_id: z.coerce.number().int().positive().optional().nullable(),
    description: z.string().trim().min(1).max(500),
    quantity: z.coerce.number().positive(),
    unit_price: z.coerce.number().nonnegative(),
  })
  .strict();

const createSchema = z
  .object({
    invoice_number: z.string().trim().min(1).max(100),
    supplier_id: z.coerce.number().int().positive(),
    invoice_date: z.coerce.date().optional().nullable(),
    due_date: z.coerce.date().optional().nullable(),
    tax: z.coerce.number().nonnegative().optional().default(0),
    status: z.enum(INVOICE_STATUSES).optional().default("pending"),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(itemSchema).min(1),
  })
  .strict();

const updateSchema = z
  .object({
    invoice_number: z.string().trim().min(1).max(100).optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    invoice_date: z.coerce.date().optional().nullable(),
    due_date: z.coerce.date().optional().nullable(),
    tax: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(itemSchema).min(1).optional(),
  })
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

const statusSchema = z
  .object({
    status: z.enum(INVOICE_STATUSES),
  })
  .strict();

const expenseSchema = z
  .object({
    category_id: z.coerce.number().int().positive(),
    expense_date: z.coerce.date().optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional().nullable(),
    reference: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    from_date: z.coerce.date().optional(),
    to_date: z.coerce.date().optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  itemSchema,
  createSchema,
  updateSchema,
  statusSchema,
  expenseSchema,
  querySchema,
};
