const { z } = require("zod");

// Time window for range-bounded widgets. Invalid/missing -> 30d default.
const querySchema = z
  .object({
    range: z.enum(["7d", "30d", "month"]).default("30d"),
  })
  .strip();

module.exports = { querySchema };
