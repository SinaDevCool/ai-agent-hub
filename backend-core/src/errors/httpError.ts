export type HttpError = Error & {
  statusCode: number;
  code: string;
};

export function httpError(statusCode: number, message: string, code: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function badRequest(message: string, code = "bad_request") {
  return httpError(400, message, code);
}

export function unauthorized(message: string, code = "unauthorized") {
  return httpError(401, message, code);
}

export function notFound(message: string, code = "not_found") {
  return httpError(404, message, code);
}
