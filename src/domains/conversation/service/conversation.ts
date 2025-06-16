// /src/domains/conversation/services/conversation-service.ts
import { baseInstance } from "@/lib/api/instance";
import { AiConversation } from "../types";

export const conversationQueryKeys = {
    all: ["conversations"] as const,
    list: () => [...conversationQueryKeys.all, "list"] as const,
    detail: (id: string) => [...conversationQueryKeys.all, "detail", id] as const,
} as const;

export class ConversationService {
    static readonly ENDPOINTS = {
        GET_CONVERSATIONS: () => `/conversations`,
        GET_CONVERSATION: (id: string) => `/conversations/${id}`,
        UPDATE_CONVERSATION: (id: string) => `/conversations/${id}`,
        DELETE_CONVERSATION: (id: string) => `/conversations/${id}`,
        CREATE_CONVERSATION: () => `/conversations`,
        SEARCH_CONVERSATIONS: () => `/conversations/search`,
    } as const;

    /**
     * Get all user conversations
     */
    static async getUserConversations(): Promise<{ conversations: AiConversation[] }> {
        console.log("🔍 CONVERSION123 API call to:", this.ENDPOINTS.GET_CONVERSATIONS());

        try {
            const response = await baseInstance.get<{ conversations: AiConversation[] }>(
                this.ENDPOINTS.GET_CONVERSATIONS()
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No conversations data in response:", response);
                throw new Error("No conversations data received from API");
            }

            // Normalize the data to ensure consistent ID handling
            const normalizedData = {
                conversations: response.data.conversations.map(conv => ({
                    ...conv,
                    id: conv.id || conv._id, // Ensure id field exists
                }))
            };

            console.log("✅ Successfully fetched conversations:", normalizedData);
            return normalizedData;
        } catch (error) {
            console.error("❌ getUserConversations API error:", error);
            throw error;
        }
    }

    /**
     * Get a single conversation by ID
     */
    static async getConversation(id: string): Promise<AiConversation> {
        console.log("🔍 Making API call to:", this.ENDPOINTS.GET_CONVERSATION(id));

        try {
            const response = await baseInstance.get<AiConversation>(
                this.ENDPOINTS.GET_CONVERSATION(id)
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No conversation data in response:", response);
                throw new Error("No conversation data received from API");
            }

            // Normalize the data
            const normalizedConversation = {
                ...response.data,
                id: response.data.id || response.data._id,
            };

            console.log("✅ Successfully fetched conversation:", normalizedConversation);
            return normalizedConversation;
        } catch (error) {
            console.error("❌ getConversation API error:", error);
            throw error;
        }
    }

    /**
     * Create a new conversation
     */
    static async createConversation(conversation: Partial<AiConversation>): Promise<AiConversation> {
        console.log("🔍 Create Conversion  API call to:", this.ENDPOINTS.CREATE_CONVERSATION());

        try {
            const response = await baseInstance.post<AiConversation>(
                this.ENDPOINTS.CREATE_CONVERSATION(),
                conversation
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No conversation data in response:", response);
                throw new Error("No conversation data received from API");
            }

            // Normalize the data
            const normalizedConversation = {
                ...response.data,
                id: response.data.id || response.data._id,
            };

            console.log("✅ Successfully created conversation:", normalizedConversation);
            return normalizedConversation;
        } catch (error) {
            console.error("❌ createConversation API error:", error);
            throw error;
        }
    }

    /**
     * Update an existing conversation
     */
    static async updateConversation(
        id: string,
        data: Partial<AiConversation>
    ): Promise<AiConversation> {
        console.log("🔍 Update Conversion  API call to:", this.ENDPOINTS.UPDATE_CONVERSATION(id));

        try {
            const response = await baseInstance.put<AiConversation>(
                this.ENDPOINTS.UPDATE_CONVERSATION(id),
                data
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success || !response.data) {
                console.error("❌ No conversation data in response:", response);
                throw new Error("No conversation data received from API");
            }

            // Normalize the data
            const normalizedConversation = {
                ...response.data,
                id: response.data.id || response.data._id,
            };

            console.log("✅ Successfully updated conversation:", normalizedConversation);
            return normalizedConversation;
        } catch (error) {
            console.error("❌ updateConversation API error:", error);
            throw error;
        }
    }
    /**
     * Delete a conversation
     */
    static async deleteConversation(id: string): Promise<void> {
        console.log("🔍 Delete Conversion  API call to:", this.ENDPOINTS.DELETE_CONVERSATION(id));

        try {
            const response = await baseInstance.delete<void>(
                this.ENDPOINTS.DELETE_CONVERSATION(id)
            );

            console.log("📡 Raw API Response:", response);

            if (!response.success) {
                console.error("❌ Failed to delete conversation:", response);
                throw new Error("Failed to delete conversation");
            }

            console.log("✅ Successfully deleted conversation with ID:", id);
        } catch (error) {
            console.error("❌ deleteConversation API error:", error);
            throw error;
        }
    }
}