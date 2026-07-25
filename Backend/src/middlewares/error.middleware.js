const { ApiError } = require("../utils/api-error");

// Map common PostgreSQL error codes to friendly ApiErrors so constraint
// violations surface as clean 4xx responses instead of leaking SQL details.
function mapDatabaseError(error) {
  switch (error.code) {
    case "23505": // unique_violation
      return new ApiError(409, "A record with these details already exists");
    case "23503": // foreign_key_violation
      return new ApiError(409, "Related record not found or still in use");
    case "23514": // check_violation
      return new ApiError(422, "A value failed a validation constraint");
    case "22P02": // invalid_text_representation (bad id/enum)
      return new ApiError(400, "Invalid value in request");
    default:
      return null;
  }
}

function errorMiddleware(error, _req, res, _next) {
  let apiError = error instanceof ApiError ? error : null;

  if (!apiError && typeof error.code === "string") {
    apiError = mapDatabaseError(error);
  }

  const statusCode = apiError?.statusCode || error.statusCode || 500;

  // Log the full error server-side; never send SQL or stack traces to clients.
  if (statusCode >= 500) {
    console.error(error);
  }

  const body = { message: apiError?.message || error.message || "Internal server error" };
  if (statusCode === 500) body.message = "Internal server error";
  if (apiError?.errors) body.errors = apiError.errors;

  res.status(statusCode).json(body);
}

module.exports = { errorMiddleware };
