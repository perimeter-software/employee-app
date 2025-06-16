export type Document = {
    id?: string;
    _id?: string;
    name: string;
    originalName: string;
    description?: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    fileExtension: string;
    company: string;
    uploadedBy: string;
    createdAt: Date;
    updatedAt: Date;
};