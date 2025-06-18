import { convertToJSON } from '@/lib/utils/mongo-utils';
import {
  ObjectId,
  type Db,
  type UpdateResult,
  type InsertOneResult,
} from 'mongodb';
import { Document } from '../types';

export async function getAllDocuments(
  db: Db,
  userId: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            uploadedBy: userId,
            status: { $ne: 'deleted' },
            isActive: true,
          },
        },
        {
          $sort: { uploadedAt: -1 },
        },
      ])
      .toArray();

    documents = documentDocs.reduce((acc: Document[], documentDoc) => {
      const conversionResult = convertToJSON(documentDoc);
      if (conversionResult) {
        acc.push(conversionResult as Document);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding documents:', e);
  }

  return documents;
}

export async function findDocumentById(
  db: Db,
  documentId: string
): Promise<Document | null> {
  try {
    const documentDoc = await db.collection('applicants').findOne({
      _id: new ObjectId(documentId),
      status: { $ne: 'deleted' },
      isActive: true,
    });

    if (!documentDoc) {
      return null;
    }

    const document = convertToJSON(documentDoc) as Document;
    return document;
  } catch (error) {
    console.error('Error finding document by ID:', error);
    return null;
  }
}

export async function createDocument(
  db: Db,
  documentData: Omit<
    Document,
    '_id' | 'createdAt' | 'updatedAt' | 'downloadCount'
  >
): Promise<InsertOneResult<Document>> {
  if (!documentData) {
    throw new Error('Invalid document data');
  }

  const Documents = db.collection('documents');

  try {
    const now = new Date();
    const newDocument = {
      ...documentData,
      createdAt: now,
      updatedAt: now,
      downloadCount: 0,
      isActive: true,
      status: 'active' as const,
    };

    const result: InsertOneResult<Document> =
      await Documents.insertOne(newDocument);
    return result;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
}

export async function updateDocument(
  db: Db,
  id: string,
  body: Partial<Document>
): Promise<UpdateResult<Document>> {
  if (body.createdAt) {
    delete body.createdAt;
  }

  const Documents = db.collection('applicants');

  try {
    const result: UpdateResult<Document> = await Documents.updateOne(
      {
        _id: new ObjectId(id),
        status: { $ne: 'deleted' },
        isActive: true,
      },
      { $set: body },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
}

export async function deleteDocument(
  db: Db,
  documentId: string,
  userId: string
): Promise<UpdateResult<Document>> {
  const Documents = db.collection('applicants');

  try {
    // Soft delete - mark as deleted instead of removing
    const result: UpdateResult<Document> = await Documents.updateOne(
      {
        _id: new ObjectId(documentId),
        uploadedBy: userId, // Ensure user owns the document
        status: { $ne: 'deleted' },
      },
      {
        $set: {
          status: 'deleted',
          isActive: false,
          updatedAt: new Date(),
        },
      },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

export async function searchDocuments(
  db: Db,
  userId: string,
  query: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            uploadedBy: userId,
            status: { $ne: 'deleted' },
            isActive: true,
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } },
              { tags: { $in: [new RegExp(query, 'i')] } },
              { category: { $regex: query, $options: 'i' } },
              { company: { $regex: query, $options: 'i' } },
            ],
          },
        },
        {
          $sort: { uploadedAt: -1 },
        },
      ])
      .toArray();

    documents = documentDocs.reduce((acc: Document[], documentDoc) => {
      const conversionResult = convertToJSON(documentDoc);
      if (conversionResult) {
        acc.push(conversionResult as Document);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error searching documents:', e);
  }

  return documents;
}

export async function findDocumentsByCompany(
  db: Db,
  userId: string,
  company: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            uploadedBy: userId,
            company: company,
            status: { $ne: 'deleted' },
            isActive: true,
          },
        },
        {
          $sort: { uploadedAt: -1 },
        },
      ])
      .toArray();

    documents = documentDocs.reduce((acc: Document[], documentDoc) => {
      const conversionResult = convertToJSON(documentDoc);
      if (conversionResult) {
        acc.push(conversionResult as Document);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding documents by company:', e);
  }

  return documents;
}

export async function findDocumentsByType(
  db: Db,
  userId: string,
  fileType: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            uploadedBy: userId,
            fileExtension: fileType.toLowerCase(),
            status: { $ne: 'deleted' },
            isActive: true,
          },
        },
        {
          $sort: { uploadedAt: -1 },
        },
      ])
      .toArray();

    documents = documentDocs.reduce((acc: Document[], documentDoc) => {
      const conversionResult = convertToJSON(documentDoc);
      if (conversionResult) {
        acc.push(conversionResult as Document);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding documents by type:', e);
  }

  return documents;
}

export async function bulkDeleteDocuments(
  db: Db,
  documentIds: string[],
  userId: string
): Promise<UpdateResult<Document[]>> {
  if (!documentIds || documentIds.length === 0) {
    throw new Error('Invalid document IDs');
  }

  if (!userId) {
    throw new Error('Invalid user ID');
  }

  const Documents = db.collection('applicants');

  try {
    const objectIds = documentIds.map((id) => new ObjectId(id));

    const result: UpdateResult<Document[]> = await Documents.updateMany(
      {
        _id: { $in: objectIds },
        uploadedBy: userId, // Ensure user owns the documents
        status: { $ne: 'deleted' },
      },
      {
        $set: {
          status: 'deleted',
          isActive: false,
          updatedAt: new Date(),
        },
      },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error bulk deleting documents:', error);
    throw error;
  }
}
