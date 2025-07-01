import { baseInstance } from "@/lib/api/instance";
import { Document } from "../types";

export const documentQueryKeys = {
    all: ["documents"] as const,
    list: () => [...documentQueryKeys.all, "list"] as const,
    detail: (id: string) => [...documentQueryKeys.all, "detail", id] as const,
} as const;

export class DocumentService {
    static readonly ENDPOINTS = {
        CREATE_DOCUMENT: () => `/documents`,
        GET_DOCUMENT: (id: string) => `/documents/${id}`,
        UPDATE_DOCUMENT: (id: string) => `/documents/${id}`,
        DELETE_DOCUMENT: (id: string) => `/documents/${id}`,
        UPLOAD_DOCUMENT: () => `/documents/upload`,
        GET_USER_DOCUMENTS: () => `/documents`,
        SEARCH_DOCUMENTS: () => `/documents/search`,
        GET_DOCUMENTS_BY_COMPANY: (company: string) => `/documents/company/${company}`,
        GET_DOCUMENTS_BY_TYPE: (type: string) => `/documents/type/${type}`,
    } as const;

    static async createDocument(data: Partial<Document>): Promise<Document> {
        const response = await baseInstance.post<Document>(
            this.ENDPOINTS.CREATE_DOCUMENT(),
            data
        );

        if (!response.success || !response.data) {
            throw new Error("No document data received from API");
        }

        return {
            ...response.data,
        };
    }

    static async getDocument(id: string): Promise<Document> {
        const response = await baseInstance.get<Document>(
            this.ENDPOINTS.GET_DOCUMENT(id)
        );

        if (!response.success || !response.data) {
            throw new Error("No document data received from API");
        }

        return {
            ...response.data,
        };
    }

    static async updateDocument(id: string, data: Partial<Document>): Promise<Document> {
        const response = await baseInstance.put<Document>(
            this.ENDPOINTS.UPDATE_DOCUMENT(id),
            data
        );

        if (!response.success || !response.data) {
            throw new Error("No updated document data received from API");
        }

        return {
            ...response.data,
        };
    }

    static async deleteDocument(id: string): Promise<void> {
        const response = await baseInstance.delete<{ deletedCount: number }>(
            this.ENDPOINTS.DELETE_DOCUMENT(id)
        );

        if (!response.success || response.data?.deletedCount !== 1) {
            throw new Error("Failed to delete document");
        }
    }

    static async uploadDocument(formData: FormData): Promise<Document> {
        const response = await baseInstance.post<Document>(
            this.ENDPOINTS.UPLOAD_DOCUMENT(),
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
        );

        if (!response.success || !response.data) {
            throw new Error("No uploaded document data received from API");
        }

        return {
            ...response.data,
        };
    }

    static async getUserDocuments(): Promise<{ documents: Document[]; count: number }> {
        const response = await baseInstance.get<{ documents: Document[]; count: number }>(
            this.ENDPOINTS.GET_USER_DOCUMENTS()
        );

        if (!response.success || !response.data) {
            throw new Error("No documents data received from API");
        }

        return {
            documents: response.data.documents.map((doc) => ({
                ...doc,
            })),
            count: response.data.count,
        };
    }

    static async searchDocuments(query: string): Promise<{ documents: Document[]; count: number }> {
        const response = await baseInstance.get<{ documents: Document[]; count: number }>(
            this.ENDPOINTS.SEARCH_DOCUMENTS(),
            { params: { query } }
        );

        if (!response.success || !response.data) {
            throw new Error("No search results data received from API");
        }

        return {
            documents: response.data.documents.map((doc) => ({
                ...doc,
            })),
            count: response.data.count,
        };
    }

    static async getDocumentsByCompany(company: string): Promise<{ documents: Document[]; count: number }> {
        const response = await baseInstance.get<{ documents: Document[]; count: number }>(
            this.ENDPOINTS.GET_DOCUMENTS_BY_COMPANY(company)
        );

        if (!response.success || !response.data) {
            throw new Error("No company documents data received from API");
        }

        return {
            documents: response.data.documents.map((doc) => ({
                ...doc,
            })),
            count: response.data.count,
        };
    }

    static async getDocumentsByType(type: string): Promise<{ documents: Document[]; count: number }> {
        const response = await baseInstance.get<{ documents: Document[]; count: number }>(
            this.ENDPOINTS.GET_DOCUMENTS_BY_TYPE(type)
        );

        if (!response.success || !response.data) {
            throw new Error("No type documents data received from API");
        }

        return {
            documents: response.data.documents.map((doc) => ({
                ...doc,
            })),
            count: response.data.count,
        };
    }
}
