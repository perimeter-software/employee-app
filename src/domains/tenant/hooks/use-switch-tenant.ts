import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TenantApiService, tenantQueryKeys } from "../services";

export const useSwitchTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: TenantApiService.switchTenant,
    onSuccess: (data) => {
      // Invalidate user-related queries after successful tenant switch
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.current() });

      // Reload page for fresh tenant context
      if (data.success) {
        window.location.reload();
      }
    },
    onError: (error) => {
      console.error("Failed to switch tenant:", error);
      // You could add toast notification here
    },
  });
};
