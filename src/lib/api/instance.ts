import { ApiClient } from "./client";

// Create singleton instance with configuration
export const baseInstance = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 10000,
});

// KEEP THIS - For 401 redirects to Auth0 login
baseInstance.responseInterceptor.use((response) => {
  if (response.status === 401) {
    // Handle auth errors - redirect to Auth0 login
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }
  return response;
});
