// domains/shared/stores/ui-store.ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface UIState {
  // Loading states
  iconsLoaded: boolean;
  isGlobalLoading: boolean;

  // Modal/Dialog states
  openMessage: boolean;

  // Selection states
  selectedJobId: string | null;
  selectedShiftSlug: string | null;

  // Sidebar/Navigation
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;

  // Theme
  darkMode: boolean;

  // Actions
  setIconsLoaded: (loaded: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  setOpenMessage: (open: boolean) => void;
  setSelectedJobId: (id: string | null) => void;
  setSelectedShiftSlug: (slug: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileMenuOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMobileMenu: () => void;
  setDarkMode: (darkMode: boolean) => void;
  toggleDarkMode: () => void;
  resetSelections: () => void;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    // Initial state
    iconsLoaded: false,
    isGlobalLoading: false,
    openMessage: false,
    selectedJobId: null,
    selectedShiftSlug: null,
    sidebarCollapsed: false,
    mobileMenuOpen: false,
    darkMode: false,

    // Actions
    setIconsLoaded: (loaded) =>
      set((state) => {
        state.iconsLoaded = loaded;
      }),

    setGlobalLoading: (loading) =>
      set((state) => {
        state.isGlobalLoading = loading;
      }),

    setOpenMessage: (open) =>
      set((state) => {
        state.openMessage = open;
      }),

    setSelectedJobId: (id) =>
      set((state) => {
        state.selectedJobId = id;
      }),

    setSelectedShiftSlug: (slug) =>
      set((state) => {
        state.selectedShiftSlug = slug;
      }),

    setSidebarCollapsed: (collapsed) =>
      set((state) => {
        state.sidebarCollapsed = collapsed;
      }),

    setMobileMenuOpen: (open) =>
      set((state) => {
        state.mobileMenuOpen = open;
        // Close sidebar when mobile menu opens
        if (open) {
          state.sidebarCollapsed = true;
        }
      }),

    toggleSidebar: () =>
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }),

    toggleMobileMenu: () =>
      set((state) => {
        state.mobileMenuOpen = !state.mobileMenuOpen;
      }),

    setDarkMode: (darkMode) =>
      set((state) => {
        state.darkMode = darkMode;
      }),

    toggleDarkMode: () =>
      set((state) => {
        state.darkMode = !state.darkMode;
      }),

    resetSelections: () =>
      set((state) => {
        state.selectedJobId = null;
        state.selectedShiftSlug = null;
      }),
  }))
);
