export * from "./client";
export * from "./errors";
export * from "./types";
export * from "./interceptors";

// Create and configure the default client
import { ApiClient } from "./client";
import { createAuthInterceptor, createTenantInterceptor } from "./interceptors";

// Create singleton instance with configuration
export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "",
  timeout: 10000,
});

// Add default interceptors
apiClient.request.use(
  createAuthInterceptor(() => {
    // Get token from wherever you store it (localStorage, cookie, etc.)
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token");
    }
    return null;
  })
);

apiClient.request.use(
  createTenantInterceptor(() => {
    // Get tenant from wherever you store it
    if (typeof window !== "undefined") {
      return localStorage.getItem("tenant_id");
    }
    return null;
  })
);

// Add response interceptor for auth errors
apiClient.response.use((response) => {
  if (response.status === 401) {
    // Handle auth errors - redirect to login
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }
  return response;
});
