const { z } = require("zod");

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"];
const ORDER_STATUSES = [
  "open",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "other"];

const nonEmpty = (data) => Object.keys(data).length > 0;

const orderItemInput = z
  .object({
    menu_item_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const createSchema = z
  .object({
    order_type: z.enum(ORDER_TYPES).optional(),
    table_id: z.coerce.number().int().positive().optional().nullable(),
    waiter_id: z.coerce.number().int().positive().optional().nullable(),
    discount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    items: z.array(orderItemInput).optional(),
  })
  .strict();

const headerUpdateSchema = z
  .object({
    table_id: z.coerce.number().int().positive().optional().nullable(),
    discount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().max(1000).optional().nullable(),
    order_type: z.enum(ORDER_TYPES).optional(),
  })
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) }).strict();

const itemUpdateSchema = z
  .object({
    quantity: z.coerce.number().int().min(1).optional(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const paymentSchema = z
  .object({
    payment_method: z.enum(PAYMENT_METHODS),
    payment_status: z.enum(PAYMENT_STATUSES).optional(),
    complete: z.boolean().optional(),
  })
  .strict();

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    status: z.string().optional(),
    payment_status: z.enum(PAYMENT_STATUSES).optional(),
    order_type: z.enum(ORDER_TYPES).optional(),
    table_id: z.coerce.number().int().positive().optional(),
    waiter_id: z.coerce.number().int().positive().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = {
  orderItemInput,
  createSchema,
  headerUpdateSchema,
  statusSchema,
  itemUpdateSchema,
  paymentSchema,
  querySchema,
  ORDER_STATUSES,
};
