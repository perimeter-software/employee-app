// /src/domains/conversation/hooks/use-conversations.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AiConversation } from "../types";
import { conversationQueryKeys, ConversationService } from "../service";

// Hook for getting all user conversations
export function useConversations() {
    return useQuery({
        queryKey: conversationQueryKeys.list(),
        queryFn: () => ConversationService.getUserConversations(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}


// Hook for creating a conversation
export function useCreateConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (conversation: Partial<AiConversation>) =>
            ConversationService.createConversation(conversation),
        onSuccess: (newConversation) => {
            // Add the new conversation to the cache
            queryClient.setQueryData(
                conversationQueryKeys.list(),
                (oldData: { conversations: AiConversation[] } | undefined) => {
                    if (!oldData) {
                        return { conversations: [newConversation] };
                    }
                    return {
                        conversations: [newConversation, ...oldData.conversations]
                    };
                }
            );

            // Also cache the individual conversation
            if (newConversation.id || newConversation._id) {
                queryClient.setQueryData(
                    conversationQueryKeys.detail(newConversation.id || newConversation._id!),
                    newConversation
                );
            }

            console.log("✅ Conversation created and cached:", newConversation);
        },
        onError: (error) => {
            console.error("❌ Failed to create conversation:", error);
        }
    });
}

// Hook for updating a conversation
export function useUpdateConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AiConversation> }) =>
            ConversationService.updateConversation(id, data),
        onSuccess: (updatedConversation, variables) => {
            // Update the individual conversation cache
            queryClient.setQueryData(
                conversationQueryKeys.detail(variables.id),
                updatedConversation
            );

            // Update the conversation in the list cache
            queryClient.setQueryData(
                conversationQueryKeys.list(),
                (oldData: { conversations: AiConversation[] } | undefined) => {
                    if (!oldData) return oldData;

                    return {
                        conversations: oldData.conversations.map(conv =>
                            (conv.id === variables.id || conv._id === variables.id)
                                ? updatedConversation
                                : conv
                        )
                    };
                }
            );

            console.log("✅ Conversation updated and cached:", updatedConversation);
        },
        onError: (error) => {
            console.error("❌ Failed to update conversation:", error);
        }
    });
}

// Hook for deleting a conversation
export function useDeleteConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => ConversationService.deleteConversation(id),
        onSuccess: (_, deletedId) => {
            // Remove from individual cache
            queryClient.removeQueries({
                queryKey: conversationQueryKeys.detail(deletedId)
            });

            // Remove from list cache
            queryClient.setQueryData(
                conversationQueryKeys.list(),
                (oldData: { conversations: AiConversation[] } | undefined) => {
                    if (!oldData) return oldData;

                    return {
                        conversations: oldData.conversations.filter(conv =>
                            conv.id !== deletedId && conv._id !== deletedId
                        )
                    };
                }
            );

            console.log("✅ Conversation deleted and removed from cache:", deletedId);
        },
        onError: (error) => {
            console.error("❌ Failed to delete conversation:", error);
        }
    });
}


// Legacy hook name for backwards compatibility (if you want to keep using useConversion)
export function useConversion() {
    return useConversations();
}