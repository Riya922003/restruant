const { ApiError } = require("../utils/api-error");

// Validate req[source] against a Zod schema. On success the parsed (coerced)
// value replaces req[source] so downstream code uses clean data. On failure a
// 422 ApiError carries per-field messages.
function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(new ApiError(422, "Validation failed", errors));
    }
    // Express 5 exposes req.query as a getter with no setter, so replace it via
    // defineProperty. req.body and req.params assign normally.
    if (source === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = result.data;
    }
    return next();
  };
}

module.exports = { validate };
