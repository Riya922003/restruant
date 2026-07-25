const { z } = require("zod");

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("A valid email is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(8, "New password must be at least 8 characters"),
  })
  .strict();

module.exports = { loginSchema, changePasswordSchema };
