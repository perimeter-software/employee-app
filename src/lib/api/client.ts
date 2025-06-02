import {
  ApiError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from "./errors";
import { InterceptorManager } from "./interceptors";
import type { ApiClientOptions, RequestConfig } from "./types";

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private interceptors: InterceptorManager;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || "";
    this.timeout = options.timeout || 10000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    this.interceptors = new InterceptorManager();
  }

  // Interceptor management
  get requestInterceptor() {
    return {
      use: (
        interceptor: (
          config: RequestConfig
        ) => RequestConfig | Promise<RequestConfig>
      ) => this.interceptors.addRequestInterceptor(interceptor),
      eject: (id: number) => this.interceptors.removeRequestInterceptor(id),
    };
  }

  get responseInterceptor() {
    return {
      use: (
        interceptor: (response: Response) => Response | Promise<Response>
      ) => this.interceptors.addResponseInterceptor(interceptor),
      eject: (id: number) => this.interceptors.removeResponseInterceptor(id),
    };
  }

  get errorInterceptor() {
    return {
      use: (interceptor: (error: Error) => Error | Promise<Error>) =>
        this.interceptors.addErrorInterceptor(interceptor),
      eject: (id: number) => this.interceptors.removeErrorInterceptor(id),
    };
  }

  // Core request method
  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = config.timeout || this.timeout;

    const processedConfig = await this.interceptors.processRequest(config);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestConfig: RequestInit = {
        signal: controller.signal,
        headers: {
          ...this.defaultHeaders,
          ...processedConfig.headers,
        },
        ...processedConfig,
      };

      const response = await fetch(url, requestConfig);
      clearTimeout(timeoutId);

      const processedResponse = await this.interceptors.processResponse(
        response
      );

      const validateStatus =
        processedConfig.validateStatus ||
        ((status) => status >= 200 && status < 300);

      if (!validateStatus(processedResponse.status)) {
        const errorData = await this.parseErrorResponse(processedResponse);

        if (processedResponse.status === 422) {
          throw new ValidationError(
            errorData.message || "Validation failed",
            errorData.errors
          );
        }

        throw new ApiError(
          `Request failed with status ${processedResponse.status}`,
          processedResponse.status,
          errorData
        );
      }

      if (
        processedResponse.status === 204 ||
        processedResponse.headers.get("content-length") === "0"
      ) {
        return null as T;
      }

      const data = await processedResponse.json();
      return data;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      const processedError = await this.interceptors.processError(
        error as Error
      );

      if (processedError instanceof ApiError) {
        throw processedError;
      }

      if (
        processedError instanceof Error &&
        processedError.name === "AbortError"
      ) {
        throw new TimeoutError();
      }

      throw new NetworkError(
        processedError instanceof Error
          ? processedError.message
          : "Unknown error"
      );
    }
  }

  private async parseErrorResponse(response: Response) {
    try {
      return await response.json();
    } catch {
      return { message: response.statusText };
    }
  }

  // HTTP Methods
  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "GET" });
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: "DELETE" });
  }

  async upload<T>(
    endpoint: string,
    formData: FormData,
    config?: RequestConfig
  ): Promise<T> {
    const uploadConfig = { ...config };
    if (uploadConfig.headers) {
      const headers = { ...uploadConfig.headers } as Record<string, string>;
      delete headers["Content-Type"];
      uploadConfig.headers = headers;
    }

    return this.request<T>(endpoint, {
      ...uploadConfig,
      method: "POST",
      body: formData,
    });
  }
}
