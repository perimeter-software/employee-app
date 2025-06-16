import { baseInstance } from "@/lib/api/instance";
import { Timesheet, TimesheetStatus, TimesheetType } from "../types/pto.types";

export const ptoQueryKeys = {
    all: ["ptos"] as const,
    list: (params: { userId?: string; status?: TimesheetStatus; type?: TimesheetType; startDate?: Date; endDate?: Date; } | undefined) => [...ptoQueryKeys.all, "list"] as const,
    detail: (id: string) => [...ptoQueryKeys.all, "detail", id] as const,
} as const;

export class PTOService {
    static listPTOs(params: { userId?: string; status?: TimesheetStatus; type?: TimesheetType; startDate?: Date; endDate?: Date; } | undefined): any {
        throw new Error("Method not implemented.");
    }
    static readonly ENDPOINTS = {
        GET_PTOS: () => `/ptos`,
        GET_PTO: (id: string) => `/ptos/${id}`,
        UPDATE_PTO: (id: string) => `/ptos/${id}`,
        DELETE_PTO: (id: string) => `/ptos/${id}`,
        CREATE_PTO: () => `/ptos`,
        SEARCH_PTOS: () => `/ptos/search`,
    } as const;

    /**
     * Get all PTO requests
     */
    static async getPTOs(params?: {
        userId?: string;
        status?: TimesheetStatus;
        type?: TimesheetType;
        startDate?: Date;
        endDate?: Date;
    }): Promise<{ ptos: Timesheet[] }> {
        console.log("🔍 PTO API call to:", this.ENDPOINTS.GET_PTOS());

        try {
            const queryParams = new URLSearchParams();
            if (params?.userId) queryParams.append("userId", params.userId);
            if (params?.status) queryParams.append("status", params.status);
            if (params?.type) queryParams.append("type", params.type);
            if (params?.startDate) queryParams.append("startDate", params.startDate.toISOString());
            if (params?.endDate) queryParams.append("endDate", params.endDate.toISOString());

            const response = await baseInstance.get<{ ptos: Timesheet[] }>(
                `${this.ENDPOINTS.GET_PTOS()}?${queryParams.toString()}`
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data to ensure consistent ID handling
            const normalizedData = {
                ptos: response.data.ptos.map(pto => ({
                    ...pto,
                    _id: pto._id, // Ensure _id field exists
                }))
            };

            console.log("✅ Successfully fetched PTOs:", normalizedData);
            return normalizedData;
        } catch (error) {
            console.error("❌ getPTOs API error:", error);
            throw error;
        }
    }

    /**
     * Get a single PTO request by ID
     */
    static async getPTO(id: string): Promise<Timesheet> {
        console.log("🔍 Making API call to:", this.ENDPOINTS.GET_PTO(id));

        try {
            const response = await baseInstance.get<Timesheet>(
                this.ENDPOINTS.GET_PTO(id)
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data
            const normalizedPTO = {
                ...response.data,
                _id: response.data._id,
            };

            console.log("✅ Successfully fetched PTO:", normalizedPTO);
            return normalizedPTO;
        } catch (error) {
            console.error("❌ getPTO API error:", error);
            throw error;
        }
    }

    /**
     * Create a new PTO request
     */
    static async createPTO(data: Omit<Timesheet, "_id" | "createdAt" | "updatedAt">): Promise<Timesheet> {
        console.log("🔍 Create PTO API call to:", this.ENDPOINTS.CREATE_PTO());

        try {
            const response = await baseInstance.post<Timesheet>(
                this.ENDPOINTS.CREATE_PTO(),
                data
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data
            const normalizedPTO = {
                ...response.data,
                _id: response.data._id,
            };

            console.log("✅ Successfully created PTO:", normalizedPTO);
            return normalizedPTO;
        } catch (error) {
            console.error("❌ createPTO API error:", error);
            throw error;
        }
    }

    /**
     * Update an existing PTO request
     */
    static async updatePTO(id: string, data: Partial<Timesheet>): Promise<Timesheet> {
        console.log("🔍 Update PTO API call to:", this.ENDPOINTS.UPDATE_PTO(id));

        try {
            const response = await baseInstance.put<Timesheet>(
                this.ENDPOINTS.UPDATE_PTO(id),
                data
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data
            const normalizedPTO = {
                ...response.data,
                _id: response.data._id,
            };

            console.log("✅ Successfully updated PTO:", normalizedPTO);
            return normalizedPTO;
        } catch (error) {
            console.error("❌ updatePTO API error:", error);
            throw error;
        }
    }

    /**
     * Delete a PTO request
     */
    static async deletePTO(id: string): Promise<void> {
        console.log("🔍 Delete PTO API call to:", this.ENDPOINTS.DELETE_PTO(id));

        try {
            const response = await baseInstance.delete<void>(
                this.ENDPOINTS.DELETE_PTO(id)
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success) {
                console.error("❌ Failed to delete PTO:", response);
                throw new Error("Failed to delete PTO");
            }

            console.log("✅ Successfully deleted PTO with ID:", id);
        } catch (error) {
            console.error("❌ deletePTO API error:", error);
            throw error;
        }
    }

    /**
     * Approve a PTO request
     */
    static async approvePTO(id: string, managerNote?: string): Promise<Timesheet> {
        console.log("🔍 Approve PTO API call to:", this.ENDPOINTS.UPDATE_PTO(id));

        try {
            const response = await baseInstance.put<Timesheet>(
                this.ENDPOINTS.UPDATE_PTO(id),
                {
                    status: "Approved",
                    managerNote: managerNote || null,
                }
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data
            const normalizedPTO = {
                ...response.data,
                _id: response.data._id,
            };

            console.log("✅ Successfully approved PTO:", normalizedPTO);
            return normalizedPTO;
        } catch (error) {
            console.error("❌ approvePTO API error:", error);
            throw error;
        }
    }

    /**
     * Reject a PTO request
     */
    static async rejectPTO(id: string, managerNote?: string): Promise<Timesheet> {
        console.log("🔍 Reject PTO API call to:", this.ENDPOINTS.UPDATE_PTO(id));

        try {
            const response = await baseInstance.put<Timesheet>(
                this.ENDPOINTS.UPDATE_PTO(id),
                {
                    status: "Not Approved",
                    managerNote: managerNote || null,
                }
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No PTO data in response:", response);
                throw new Error("No PTO data received from API");
            }

            // Normalize the data
            const normalizedPTO = {
                ...response.data,
                _id: response.data._id,
            };

            console.log("✅ Successfully rejected PTO:", normalizedPTO);
            return normalizedPTO;
        } catch (error) {
            console.error("❌ rejectPTO API error:", error);
            throw error;
        }
    }
}
