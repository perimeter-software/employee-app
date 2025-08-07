import { NextResponse } from 'next/server';
import { getTenantAwareConnection } from '@/lib/db';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { AuthenticatedRequest } from '@/domains/user/types';
import {
  createDocument,
  getAllDocuments,
} from '@/domains/document/utils/mongo-document-utils';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

import { Document } from '@/domains/document/types';
import { parseFormDataWithFile } from '@/lib/utils/client-processing-utils';

const uploadDir = path.resolve('./public/uploads/documents');

// GET - Get all user documents
async function getDocumentsHandler(
  request: AuthenticatedRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const { db } = await getTenantAwareConnection(request);
    // Use applicantId instead of id/sub for MongoDB operations
    const applicantId =
      request.user?.applicantId || request.user?.id || request.user?.sub;

    console.log('🔍 API - User object:', request.user);
    console.log('🔍 API - Extracted applicantId:', applicantId);
    console.log('🔍 API - applicantId type:', typeof applicantId);

    if (!applicantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'unauthorized',
          message: 'Applicant ID not found',
        },
        { status: 401 }
      );
    }

    const result = await getAllDocuments(db, applicantId as string);

    return NextResponse.json({
      success: true,
      message: 'Documents fetched successfully',
      data: {
        documents: result,
        count: result.length,
      },
    });
  } catch (error) {
    console.error('❌ GET /documents error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-server-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// POST - Create document with file upload
async function createDocumentHandler(
  request: AuthenticatedRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const { db } = await getTenantAwareConnection(request);
    const applicantId = request.user?.applicantId || request.user?.sub;

    if (!applicantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'unauthorized',
          message: 'Applicant ID not found',
        },
        { status: 401 }
      );
    }

    const { fields, file } = await parseFormDataWithFile(request); // 🧠 helper to parse FormData

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'missing-file', message: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Save file
    const fileExt = path.extname(file.name || '');
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const documentData: Document = {
      name: fields.name || '',
      filePath: `/uploads/documents/${fileName}`,
      fileName: file.name || '',
      fileType: file.type || '',
      fileSize: file.size || 0,
      description: fields.description || '',
      originalName: '',
      fileExtension: '',
      company: '',
      uploadedBy: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await createDocument(db, documentData);

    return NextResponse.json(
      {
        success: true,
        message: 'Document created successfully',
        data: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ POST /documents error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-server-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getDocumentsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const POST = withEnhancedAuthAPI(createDocumentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
