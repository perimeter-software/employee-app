import { ApiErrorData } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: ApiErrorData
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError() {
    return this.status >= 500;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  get isTimeout() {
    return this.status === 408;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidationError() {
    return this.status === 422;
  }
}

export class NetworkError extends ApiError {
  constructor(message = "Network connection failed") {
    super(message, 0);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends ApiError {
  constructor(message = "Request timeout") {
    super(message, 408);
    this.name = "TimeoutError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, errors?: Record<string, string[]>) {
    super(message, 422, { errors });
    this.name = "ValidationError";
  }

  get fieldErrors() {
    return this.data?.errors || {};
  }
}
