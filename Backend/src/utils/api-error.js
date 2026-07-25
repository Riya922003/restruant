class ApiError extends Error {
  // errors is an optional array of { field, message } used for 422 validation
  // responses so the client can map messages back to form fields.
  constructor(statusCode, message, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

module.exports = { ApiError };
