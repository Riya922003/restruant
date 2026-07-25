const { z } = require("zod");

const STATUS = ["available", "occupied", "reserved", "out_of_service"];

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(50),
    capacity: z.coerce.number().int().min(1),
    section: z.string().trim().max(50).optional().nullable(),
    status: z.enum(STATUS).optional(),
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
    status: z.enum(STATUS).optional(),
    section: z.string().trim().optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = { createSchema, updateSchema, querySchema, STATUS };
