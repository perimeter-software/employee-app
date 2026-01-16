// providers/react-query-provider.tsx

"use client";

import React, { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

interface ReactQueryProviderProps {
  children: ReactNode;
}

const ReactQueryProvider: React.FC<ReactQueryProviderProps> = ({
  children,
}) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Global defaults for all queries
            staleTime: 5 * 60 * 1000, // 5 minutes (increased from 1 minute)
            gcTime: 30 * 60 * 1000, // 30 minutes (increased from 10 minutes)
            retry: (failureCount, error) => {
              // Don't retry on auth errors
              if (
                error.message.includes("401") ||
                error.message.includes("403")
              ) {
                return false;
              }
              // Don't retry on validation errors
              if (error.message.includes("422")) {
                return false;
              }
              return failureCount < 2; // Reduced from 3 to 2
            },
            refetchOnWindowFocus: false,
            refetchOnReconnect: false, // Changed to false to prevent unnecessary refetches
            refetchOnMount: false, // Don't refetch on mount if data is fresh
          },
          mutations: {
            // Global defaults for all mutations
            retry: (failureCount, error) => {
              // Don't retry mutations on auth or validation errors
              if (
                error.message.includes("401") ||
                error.message.includes("403") ||
                error.message.includes("422")
              ) {
                return false;
              }
              return failureCount < 1; // Only retry once for mutations
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools in development */}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
};

export default ReactQueryProvider;
