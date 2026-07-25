const { z } = require("zod");

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];

const nonEmpty = (data) => Object.keys(data).length > 0;
const nonEmptyMsg = { message: "At least one field is required" };

// ---- Expense categories ----------------------------------------------------

const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

const categoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

// ---- Expense records -------------------------------------------------------

const recordCreateSchema = z
  .object({
    category_id: z.coerce.number().int().positive(),
    supplier_id: z.coerce.number().int().positive().optional().nullable(),
    invoice_id: z.coerce.number().int().positive().optional().nullable(),
    description: z.string().trim().min(1).max(500),
    amount: z.coerce.number().nonnegative(),
    expense_date: z.coerce.date(),
    payment_method: z.enum(PAYMENT_METHODS).optional().nullable(),
    reference: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

const recordUpdateSchema = recordCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, nonEmptyMsg);

const recordQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    category_id: z.coerce.number().int().positive().optional(),
    supplier_id: z.coerce.number().int().positive().optional(),
    invoice_id: z.coerce.number().int().positive().optional(),
    from_date: z.coerce.date().optional(),
    to_date: z.coerce.date().optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    search: z.string().trim().optional(),
  })
  .strip();

// ---- Monthly tracking ------------------------------------------------------

const monthlyQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .strip();

const monthSummaryQuerySchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strip();

module.exports = {
  PAYMENT_METHODS,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryQuerySchema,
  recordCreateSchema,
  recordUpdateSchema,
  recordQuerySchema,
  monthlyQuerySchema,
  monthSummaryQuerySchema,
};
