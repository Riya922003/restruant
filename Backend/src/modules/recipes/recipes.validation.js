const { z } = require("zod");

const UNITS = ["kg", "g", "l", "ml", "unit", "pack", "dozen", "box"];
const nonEmpty = (data) => Object.keys(data).length > 0;

const ingredientInput = z
  .object({
    ingredient_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().positive(),
    unit: z.enum(UNITS),
  })
  .strict();

const createSchema = z
  .object({
    menu_item_id: z.coerce.number().int().positive(),
    yield_servings: z.coerce.number().int().min(1).optional(),
    instructions: z.string().trim().max(5000).optional().nullable(),
    prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(),
    ingredients: z.array(ingredientInput).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    yield_servings: z.coerce.number().int().min(1).optional(),
    instructions: z.string().trim().max(5000).optional().nullable(),
    prep_time_minutes: z.coerce.number().int().min(0).optional().nullable(),
  })
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const replaceIngredientsSchema = z
  .object({ ingredients: z.array(ingredientInput).min(0) })
  .strict();

const lineUpdateSchema = z
  .object({
    quantity: z.coerce.number().positive().optional(),
    unit: z.enum(UNITS).optional(),
  })
  .strict()
  .refine(nonEmpty, { message: "At least one field is required" });

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    menu_item_id: z.coerce.number().int().positive().optional(),
    ingredient_id: z.coerce.number().int().positive().optional(),
    search: z.string().trim().optional(),
  })
  .strip();

module.exports = {
  ingredientInput,
  createSchema,
  updateSchema,
  replaceIngredientsSchema,
  lineUpdateSchema,
  querySchema,
};
