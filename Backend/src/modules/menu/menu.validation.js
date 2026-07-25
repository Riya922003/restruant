const { z } = require("zod");

const nonEmpty = (data) => Object.keys(data).length > 0;

const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional().nullable(),
    sort_order: z.coerce.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const itemCreateSchema = z
  .object({
    category_id: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional().nullable(),
    price: z.coerce.number().min(0),
    cost: z.coerce.number().min(0).optional().nullable(),
    prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(),
    is_available: z.boolean().optional(),
    image_url: z.string().trim().url().max(500).optional().nullable(),
  })
  .strict();

const itemUpdateSchema = itemCreateSchema
  .partial()
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const availabilitySchema = z.object({ is_available: z.boolean() }).strict();

const categoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    search: z.string().trim().optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
    include: z.enum(["items"]).optional(),
  })
  .strip();

const itemQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    category_id: z.coerce.number().int().positive().optional(),
    is_available: z.enum(["true", "false"]).optional(),
    is_active: z.enum(["true", "false", "all"]).optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = {
  categoryCreateSchema,
  categoryUpdateSchema,
  itemCreateSchema,
  itemUpdateSchema,
  availabilitySchema,
  categoryQuerySchema,
  itemQuerySchema,
};
