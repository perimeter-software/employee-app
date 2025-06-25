import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document } from '../types';
import { documentQueryKeys, DocumentService } from '../services';

// 🔍 Get all user documents
export function useDocuments() {
  return useQuery({
    queryKey: documentQueryKeys.list(),
    queryFn: () => DocumentService.getUserDocuments(),
    staleTime: 5 * 60 * 1000,
  });
}

// 🆕 Create a new document
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Document>) =>
      DocumentService.createDocument(data),
    onSuccess: (newDoc: Document) => {
      queryClient.setQueryData(
        documentQueryKeys.list(),
        (oldData: { documents: Document[]; count: number } | undefined) => {
          if (!oldData) {
            return { documents: [newDoc], count: 1 };
          }
          return {
            documents: [newDoc, ...oldData.documents],
            count: oldData.count + 1,
          };
        }
      );

      if (newDoc.id || newDoc._id) {
        queryClient.setQueryData(
          documentQueryKeys.detail((newDoc.id || newDoc._id)!),
          newDoc
        );
      }
    },
    onError: (error) => {
      console.error('❌ Failed to create document:', error);
    },
  });
}

// ✏️ Update a document
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Document> }) =>
      DocumentService.updateDocument(id, data),
    onSuccess: (updatedDoc, { id }) => {
      queryClient.setQueryData(documentQueryKeys.detail(id), updatedDoc);

      queryClient.setQueryData(
        documentQueryKeys.list(),
        (oldData: { documents: Document[]; count: number } | undefined) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            documents: oldData.documents.map((doc) =>
              doc.id === id || doc._id === id ? updatedDoc : doc
            ),
          };
        }
      );
    },
    onError: (error) => {
      console.error('❌ Failed to update document:', error);
    },
  });
}

// ❌ Delete a document
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => DocumentService.deleteDocument(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({
        queryKey: documentQueryKeys.detail(deletedId),
      });

      queryClient.setQueryData(
        documentQueryKeys.list(),
        (oldData: { documents: Document[]; count: number } | undefined) => {
          if (!oldData) return oldData;
          return {
            documents: oldData.documents.filter(
              (doc) => doc.id !== deletedId && doc._id !== deletedId
            ),
            count: oldData.count - 1,
          };
        }
      );
    },
    onError: (error) => {
      console.error('❌ Failed to delete document:', error);
    },
  });
}
