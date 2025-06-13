import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from "axios";
import { ApiClientOptions, ApiErrorWithDetails, ApiResponse } from "./types";

export class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor(options: ApiClientOptions = {}) {
    this.axiosInstance = axios.create({
      baseURL: options.baseUrl || "",
      timeout: options.timeout || 10000,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Check if the response has the expected ApiResponse structure
        const data = response.data as ApiResponse<unknown>;

        // If the API returns success: false, treat it as an error
        if (
          data &&
          typeof data === "object" &&
          "success" in data &&
          !data.success
        ) {
          const error = new Error(
            data.message || "API request failed"
          ) as ApiErrorWithDetails;
          // Attach additional error info
          error.errorCode = data.error;
          error.apiResponse = data;
          throw error;
        }

        return response;
      },
      (error: AxiosError) => {
        // Handle network/connection errors
        if (error.code === "ECONNABORTED") {
          throw new Error("Request timeout");
        }

        if (!error.response) {
          throw new Error("Network connection failed");
        }

        // Try to extract error information from the standardized API response
        const apiResponse = error.response.data as ApiResponse<unknown>;

        if (apiResponse && typeof apiResponse === "object") {
          // If it's our standardized error format
          if ("success" in apiResponse && apiResponse.success === false) {
            const errorMessage = apiResponse.message || "API request failed";
            const apiError = new Error(errorMessage) as ApiErrorWithDetails;

            // Attach additional error information
            apiError.errorCode = apiResponse.error;
            apiError.status = error.response.status;
            apiError.apiResponse = apiResponse;

            throw apiError;
          }

          // Legacy error handling for non-standardized responses
          if ("message" in apiResponse) {
            throw new Error(apiResponse.message as string);
          }
        }

        // Fallback for validation errors (422) - legacy support
        if (error.response.status === 422) {
          const errorData = error.response.data as {
            message?: string;
            errors?: Record<string, string[]>;
          };
          throw new Error(errorData.message || "Validation failed");
        }

        // For other HTTP errors without proper API response format
        throw new Error(`Request failed with status ${error.response.status}`);
      }
    );
  }

  // Interceptor management - direct access to axios interceptors
  get requestInterceptor() {
    return this.axiosInstance.interceptors.request;
  }

  get responseInterceptor() {
    return this.axiosInstance.interceptors.response;
  }

  // HTTP Methods - these now return the full ApiResponse type
  async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.get<ApiResponse<T>>(
      endpoint,
      config
    );
    return response.data;
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.post<ApiResponse<T>>(
      endpoint,
      data,
      config
    );
    return response.data;
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.put<ApiResponse<T>>(
      endpoint,
      data,
      config
    );
    return response.data;
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.patch<ApiResponse<T>>(
      endpoint,
      data,
      config
    );
    return response.data;
  }

  async delete<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.delete<ApiResponse<T>>(
      endpoint,
      config
    );
    return response.data;
  }

  async upload<T>(
    endpoint: string,
    formData: FormData,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.post<ApiResponse<T>>(
      endpoint,
      formData,
      {
        ...config,
        headers: {
          "Content-Type": "multipart/form-data",
          ...config?.headers,
        },
      }
    );
    return response.data;
  }

  // Direct access to axios instance for advanced usage
  get axios() {
    return this.axiosInstance;
  }
}
