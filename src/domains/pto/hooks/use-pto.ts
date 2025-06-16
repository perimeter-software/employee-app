import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timesheet, TimesheetStatus, TimesheetType } from "../types/pto.types";
import { PTOService, ptoQueryKeys } from "../services/pto-service";

// 🔍 Get all PTO entries
export function usePTOList(params?: {
    userId?: string;
    status?: TimesheetStatus;
    type?: TimesheetType;
    startDate?: Date;
    endDate?: Date;
}) {
    return useQuery({
        queryKey: ptoQueryKeys.list(params),
        queryFn: () => PTOService.listPTOs(params),
        staleTime: 5 * 60 * 1000,
    });
}

// 📄 Get a single PTO by ID
export function usePTO(id: string) {
    return useQuery({
        queryKey: ptoQueryKeys.detail(id),
        queryFn: () => PTOService.getPTO(id),
        enabled: !!id,
    });
}

// ➕ Create a new PTO entry
export function useCreatePTO() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: Omit<Timesheet, "_id" | "createdAt" | "updatedAt">) =>
            PTOService.createPTO(data),
        onSuccess: (newPTO) => {
            queryClient.invalidateQueries({ queryKey: ptoQueryKeys.all });

            queryClient.setQueryData(
                ptoQueryKeys.detail(newPTO._id ?? ""),
                newPTO
            );

            console.log("✅ PTO created and cached:", newPTO);
        },
        onError: (error) => {
            console.error("❌ Failed to create PTO:", error);
        }
    });
}

// ✏️ Update existing PTO
export function useUpdatePTO() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Timesheet> }) =>
            PTOService.updatePTO(id, data),
        onSuccess: (updatedPTO, { id }) => {
            queryClient.setQueryData(ptoQueryKeys.detail(id), updatedPTO);
            queryClient.invalidateQueries({ queryKey: ptoQueryKeys.all });

            console.log("✅ PTO updated and cached:", updatedPTO);
        },
        onError: (error) => {
            console.error("❌ Failed to update PTO:", error);
        }
    });
}

// ❌ Delete PTO
export function useDeletePTO() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => PTOService.deletePTO(id),
        onSuccess: (_, id) => {
            queryClient.removeQueries({ queryKey: ptoQueryKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: ptoQueryKeys.all });

            console.log("✅ PTO deleted:", id);
        },
        onError: (error) => {
            console.error("❌ Failed to delete PTO:", error);
        }
    });
}

// ✅ Approve PTO
export function useApprovePTO() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) =>
            PTOService.approvePTO(id, note),
        onSuccess: (updatedPTO, { id }) => {
            queryClient.setQueryData(ptoQueryKeys.detail(id), updatedPTO);
            queryClient.invalidateQueries({ queryKey: ptoQueryKeys.all });

            console.log("✅ PTO approved:", updatedPTO);
        },
        onError: (error) => {
            console.error("❌ Failed to approve PTO:", error);
        }
    });
}

// 🚫 Reject PTO
export function useRejectPTO() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) =>
            PTOService.rejectPTO(id, note),
        onSuccess: (updatedPTO, { id }) => {
            queryClient.setQueryData(ptoQueryKeys.detail(id), updatedPTO);
            queryClient.invalidateQueries({ queryKey: ptoQueryKeys.all });

            console.log("🚫 PTO rejected:", updatedPTO);
        },
        onError: (error) => {
            console.error("❌ Failed to reject PTO:", error);
        }
    });
}
