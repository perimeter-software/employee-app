// utils/reset-stores.ts
/**
 * Utility function to reset all Zustand stores when switching tenants
 * This ensures that no tenant-specific data persists between tenant switches
 */

import { useUserStore } from '@/domains/user/stores/user-store';
import { useJobStore } from '@/domains/job/stores/job-store';
import { useCompanyStore } from '@/domains/company/stores/company-store';
import { useUIStore } from '@/domains/shared/stores/ui-store';
import { usePunchViewerStore } from '@/domains/punch/stores/punch-viewer-store';
import { usePunchLoadingStore } from '@/domains/punch/stores/punch-loading-store';
import { useNotificationStore } from '@/domains/notification/stores/notification-store';
import { useDateStore } from '@/domains/shared/stores/date-store';

export const resetAllStores = () => {
  console.log('🔄 Resetting all Zustand stores...');

  try {
    // Reset user store
    useUserStore.getState().reset();
    console.log('✅ Reset user store');

    // Reset job store
    useJobStore.getState().reset();
    console.log('✅ Reset job store');

    // Reset company store
    useCompanyStore.getState().reset();
    console.log('✅ Reset company store');

    // Reset UI store selections (but keep UI preferences)
    useUIStore.getState().resetSelections();
    console.log('✅ Reset UI store selections');

    // Clear punch viewer store and its localStorage
    console.log('🔍 Punch viewer store before clear:', {
      selectedJob: usePunchViewerStore.getState().selectedJob?.title,
      selectedShift: usePunchViewerStore.getState().selectedShift?.slug,
    });

    usePunchViewerStore.getState().clear();

    // Also manually clear the persisted storage to ensure no stale data
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('punch-viewer-store');
        console.log('✅ Cleared punch viewer localStorage');
      } catch (error) {
        console.warn(
          'Warning: Could not clear punch viewer localStorage:',
          error
        );
      }
    }

    // Verify the store was cleared
    console.log('🔍 Punch viewer store after clear:', {
      selectedJob: usePunchViewerStore.getState().selectedJob?.title,
      selectedShift: usePunchViewerStore.getState().selectedShift?.slug,
    });

    console.log('✅ Cleared punch viewer store');

    // Reset punch loading store dates and fetch count
    usePunchLoadingStore
      .getState()
      .setLoadedPunchesDateRange({ start: null, end: null });
    usePunchLoadingStore.getState().resetFetchCount();
    console.log('✅ Reset punch loading store');

    // Clear all notifications (but don't reset the current notification being shown)
    useNotificationStore.getState().clearAll();
    console.log('✅ Cleared notifications');

    // Reset date store to current week/month
    useDateStore.getState().goToCurrentWeek();
    useDateStore.getState().goToCurrentMonth();
    console.log('✅ Reset date store to current dates');

    console.log('🎉 All stores reset successfully');
  } catch (error) {
    console.error('❌ Error resetting stores:', error);
  }
};
