const { z } = require("zod");

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    action: z.string().trim().optional(),
    entity_type: z.string().trim().optional(),
    entity_id: z.coerce.number().int().optional(),
    actor_user_id: z.coerce.number().int().optional(),
    // ISO date or datetime; compared against created_at (timestamptz).
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  })
  .strip();

module.exports = { querySchema };
