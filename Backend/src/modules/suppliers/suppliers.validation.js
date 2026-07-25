const { z } = require("zod");

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contact_name: z.string().trim().max(200).optional().nullable(),
    email: z.string().trim().email().max(200).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    address: z.string().trim().max(1000).optional().nullable(),
    payment_terms: z.string().trim().max(100).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .strict();

const updateSchema = createSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
  })
  .strip();

module.exports = { createSchema, updateSchema, querySchema };
