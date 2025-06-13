import { ApiClient } from "./client";

// Create singleton instance with configuration
export const baseInstance = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 10000,
});

// Add 401 redirect interceptor
baseInstance.responseInterceptor.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log("Authentication expired, redirecting to login...");

      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 0);
      }
    }

    return Promise.reject(error);
  }
);
