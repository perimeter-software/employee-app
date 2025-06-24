import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TenantApiService, tenantQueryKeys } from '../services';

export const useSwitchTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: TenantApiService.switchTenant,
    onSuccess: (data) => {
      console.log('🔄 Tenant switch successful:', data);

      // Invalidate tenant and user-related queries after successful tenant switch
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['user'] }); // Invalidate all user queries
      queryClient.invalidateQueries({ queryKey: ['current-user'] }); // Invalidate current user specifically

      // Reload page for fresh tenant context
      if (data.success) {
        console.log('🔄 Reloading page for fresh tenant context...');
        window.location.reload();
      }
    },
    onError: (error) => {
      console.error('❌ Failed to switch tenant:', error);
      // You could add toast notification here
    },
  });
};
