/** Errors with an HTTP status and a stable code; never leak internals. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export const unauthorized = () => new ApiError(401, 'unauthorized')
export const forbidden = (code = 'forbidden') => new ApiError(403, code)
/** Used for "not yours" too: never confirm another user's object exists. */
export const notFound = () => new ApiError(404, 'not_found')
export const badRequest = (code = 'bad_request', message?: string) =>
  new ApiError(400, code, message)
export const conflict = (code = 'conflict') => new ApiError(409, code)
