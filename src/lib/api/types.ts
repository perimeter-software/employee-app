export type ApiClientOptions = {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
};

export type RequestConfig = RequestInit & {
  timeout?: number;
  retries?: number;
  validateStatus?: (status: number) => boolean;
};

export type AuthTokens = {
  accessToken?: string;
  refreshToken?: string;
};

export type ApiErrorData = {
  message?: string;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
};

export type Interceptor = {
  request?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  response?: (response: Response) => Response | Promise<Response>;
  error?: (error: Error) => Error | Promise<Error>;
};


export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}