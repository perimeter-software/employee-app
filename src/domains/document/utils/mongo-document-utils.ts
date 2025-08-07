import { convertToJSON } from '@/lib/utils/mongo-utils';
import {
  ObjectId,
  type Db,
  type UpdateResult,
  type InsertOneResult,
} from 'mongodb';
import { Document, MongoAttachment } from '../types';

// Helper function to convert MongoAttachment to Document
function attachmentToDocument(
  attachment: MongoAttachment,
  applicantId: string
): Document {
  return {
    _id: attachment._id?.toString() || new ObjectId().toString(),
    applicantId: applicantId,
    uploadedAt: attachment.uploadDate || attachment.uploadedAt || new Date(),
    name: attachment.title || attachment.filename || '',
    originalName: attachment.filename || attachment.title || '',
    fileType: attachment.docType || '',
    type: attachment.type,
    fileName: attachment.filename || attachment.title || '',
    createdAt: attachment.uploadDate || new Date(),
    updatedAt: attachment.uploadDate || new Date(),
    ...attachment, // Include any additional properties from attachment
  };
}

export async function getAllDocuments(
  db: Db,
  applicantId: string
): Promise<Document[]> {
  let documents: Document[] = [];

  console.log('🔍 getAllDocuments called with applicantId:', applicantId);

  // Validate ObjectId format
  if (!ObjectId.isValid(applicantId)) {
    console.error('❌ Invalid applicantId format:', applicantId);
    return documents;
  }

  try {
    const applicantDoc = await db.collection('applicants').findOne({
      _id: new ObjectId(applicantId),
    });

    console.log('🔍 Query result:', applicantDoc ? 'Found' : 'Not found');
    console.log('🔍 Applicant result:', applicantDoc);

    if (
      applicantDoc &&
      applicantDoc.attachments &&
      Array.isArray(applicantDoc.attachments)
    ) {
      console.log('Raw attachments from DB:', applicantDoc.attachments);
      console.log('Attachments count:', applicantDoc.attachments.length);

      documents = (applicantDoc.attachments as MongoAttachment[])
        .filter(
          (attachment: MongoAttachment) => attachment && !attachment.deleted
        )
        .map((attachment: MongoAttachment) =>
          attachmentToDocument(attachment, applicantId)
        )
        .sort((a: Document, b: Document) => {
          const dateA = new Date(a.uploadedAt || 0);
          const dateB = new Date(b.uploadedAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
    }
  } catch (e) {
    console.error('❌ Error finding documents:', e);
  }

  console.log('🔍 Returning documents:', documents.length, 'documents');
  return documents;
}

export async function findDocumentById(
  db: Db,
  documentId: string
): Promise<Document | null> {
  try {
    const documentDoc = await db.collection('applicants').findOne({
      _id: new ObjectId(documentId),
      status: { $ne: 'Deleted' },
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
        status: { $ne: 'Deleted' },
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
  documentId: string
): Promise<UpdateResult<Document>> {
  const Documents = db.collection('applicants');

  try {
    // Soft delete - mark as deleted instead of removing
    const result: UpdateResult<Document> = await Documents.updateOne(
      {
        _id: new ObjectId(documentId),
        status: { $ne: 'Deleted' },
      },
      {
        $set: {
          status: 'Deleted',
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
  query: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            status: { $ne: 'Deleted' },
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
  company: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            company: company,
            status: { $ne: 'Deleted' },
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
  fileType: string
): Promise<Document[]> {
  let documents: Document[] = [];

  try {
    const documentDocs = await db
      .collection('applicants')
      .aggregate([
        {
          $match: {
            fileExtension: fileType.toLowerCase(),
            status: { $ne: 'Deleted' },
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
  documentIds: string[]
): Promise<UpdateResult<Document[]>> {
  if (!documentIds || documentIds.length === 0) {
    throw new Error('Invalid document IDs');
  }

  const Documents = db.collection('applicants');

  try {
    const objectIds = documentIds.map((id) => new ObjectId(id));

    const result: UpdateResult<Document[]> = await Documents.updateMany(
      {
        _id: { $in: objectIds },
        status: { $ne: 'Deleted' },
      },
      {
        $set: {
          status: 'Deleted',
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
