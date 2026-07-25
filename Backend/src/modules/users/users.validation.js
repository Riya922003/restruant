const { z } = require("zod");

const userRole = z.enum([
  "owner",
  "manager",
  "chef",
  "waiter",
  "cashier",
  "store_manager",
]);

const createSchema = z
  .object({
    full_name: z.string().trim().min(1, "Full name is required").max(120),
    email: z.string().trim().email("A valid email is required").toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: userRole,
    phone: z.string().trim().max(30).optional().nullable(),
  })
  .strict();

const updateSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    role: userRole.optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

const resetPasswordSchema = z
  .object({
    new_password: z.string().min(8, "Password must be at least 8 characters"),
  })
  .strict();

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    role: userRole.optional(),
    // Enum rather than z.coerce.boolean() because Boolean("false") === true.
    is_active: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strip();

module.exports = { createSchema, updateSchema, resetPasswordSchema, querySchema };
