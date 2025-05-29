// domains/company/stores/company-store.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Company } from "../types";

export interface CompanyState {
  primaryCompany: Company | null;
  companies: Company[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setPrimaryCompany: (company: Company | null) => void;
  setCompanies: (companies: Company[]) => void;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, updates: Partial<Company>) => void;
  removeCompany: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  updatePrimaryCompany: () => Promise<Company | null>;
}

export const useCompanyStore = create<CompanyState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      primaryCompany: null,
      companies: [],
      isLoading: false,
      error: null,

      setPrimaryCompany: (company) =>
        set((state) => {
          state.primaryCompany = company;
          state.error = null;
        }),

      setCompanies: (companies) =>
        set((state) => {
          state.companies = companies;
          state.error = null;
        }),

      addCompany: (company) =>
        set((state) => {
          state.companies.push(company);
        }),

      updateCompany: (id, updates) =>
        set((state) => {
          const index = state.companies.findIndex((c: Company) => c._id === id);
          if (index !== -1) {
            Object.assign(state.companies[index], updates);
          }

          // Update primary company if it's the same one
          if (state.primaryCompany?._id === id) {
            Object.assign(state.primaryCompany, updates);
          }
        }),

      removeCompany: (id) =>
        set((state) => {
          state.companies = state.companies.filter(
            (c: Company) => c._id !== id
          );

          // Clear primary company if it was removed
          if (state.primaryCompany?._id === id) {
            state.primaryCompany = null;
          }
        }),

      setLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
        }),

      setError: (error) =>
        set((state) => {
          state.error = error;
        }),

      reset: () =>
        set((state) => {
          state.primaryCompany = null;
          state.companies = [];
          state.isLoading = false;
          state.error = null;
        }),

      updatePrimaryCompany: async () => {
        const state = get();
        state.setLoading(true);
        state.setError(null);

        try {
          const response = await fetch("/api/companies/primary", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });

          if (!response.ok) {
            const message = `Error fetching primary company. Status: ${response.status}`;
            console.error(message);
            state.setError(message);
            return null;
          }

          const company = await response.json();
          state.setPrimaryCompany(company);
          return company;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          console.error("Error fetching primary company:", error);
          state.setError(errorMessage);
          return null;
        } finally {
          state.setLoading(false);
        }
      },
    }))
  )
);
