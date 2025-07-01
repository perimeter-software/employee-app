import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TenantApiService, tenantQueryKeys } from '../services';
import { resetAllStores } from '@/lib/utils/reset-stores';
import { toast } from 'sonner';

export const useSwitchTenant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: TenantApiService.switchTenant,
    onMutate: () => {
      // Show loading notification
      console.log('🔄 Starting tenant switch...');
    },
    onSuccess: (data) => {
      console.log('🔄 Tenant switch successful:', data);
      console.log('🔄 onSuccess callback triggered - switch was successful');

      // Show success notification
      toast.success('Tenant switched successfully! Refreshing page...', {
        duration: 2000,
      });

      // Clear all client-side caches and state
      console.log('🧹 Clearing all client-side caches...');

      // 1. Clear React Query cache completely
      queryClient.clear();

      // 2. Reset all Zustand stores
      resetAllStores();

      // 3. Clear any localStorage items that might be tenant-specific
      if (typeof window !== 'undefined') {
        // First, explicitly clear known store keys
        const explicitKeysToRemove = [
          'punch-viewer-store',
          'job-store',
          'user-store',
          'company-store',
          'ui-store',
        ];

        explicitKeysToRemove.forEach((key) => {
          try {
            localStorage.removeItem(key);
            console.log(`🗑️ Explicitly removed localStorage key: ${key}`);
          } catch (error) {
            console.warn(`Warning: Could not remove key ${key}:`, error);
          }
        });

        // Then scan for any other tenant-specific keys
        const keysToRemove: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            !explicitKeysToRemove.includes(key) && // Don't double-remove
            (key.includes('job') ||
              key.includes('punch') ||
              key.includes('notification') ||
              key.includes('dashboard') ||
              key.includes('company') ||
              key.includes('pto') ||
              key.includes('user') ||
              key.includes('ui-store') ||
              key.includes('tenant'))
          ) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
          console.log(`🗑️ Removed localStorage key: ${key}`);
        });

        // Clear sessionStorage as well
        sessionStorage.clear();
        console.log('🗑️ Cleared sessionStorage');
      }

      // 4. Invalidate specific query groups for extra safety
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['punches'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['pto'] });

      // Force page reload after a short delay to allow notification to show
      console.log('🔄 Reloading page for fresh tenant context...');

      // Add additional delay to ensure all store clearing is complete
      setTimeout(() => {
        console.log('🔄 Final verification before reload:');
        console.log(
          '- React Query cache size:',
          queryClient.getQueryCache().getAll().length
        );
        console.log(
          '- localStorage punch-viewer-store:',
          localStorage.getItem('punch-viewer-store')
        );

        window.location.reload();
      }, 2000); // Increased delay to 2 seconds
    },
    onError: (err) => {
      console.error('❌ Failed to switch tenant:', err);
      toast.error('Failed to switch tenant. Please try again.');
    },
  });
};
