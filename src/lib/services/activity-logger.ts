// lib/services/activity-logger.ts
// Service for logging employee activities directly to the database
// This file is server-only and should not be imported in client components

import 'server-only';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface ActivityLogData {
  action: string;
  description: string;
  applicantId?: string;
  userId?: string;
  agent?: string;
  createAgent?: string;
  email?: string;
  eventId?: string;
  jobId?: string;
  venueId?: string;
  details?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  type?: string;
  integration?: string;
  hideFromEmployee?: string;
}

/**
 * Helper to safely convert string to ObjectId
 */
function toObjectId(id: string | undefined): ObjectId | undefined {
  if (!id) return undefined;
  try {
    return new ObjectId(id);
  } catch {
    return undefined;
  }
}

/**
 * Log an activity directly to the database
 * This function is fire-and-forget - errors are logged but don't throw
 */
export async function logActivity(
  db: Db,
  data: ActivityLogData
): Promise<void> {
  try {
    const dbName = db.databaseName;
    console.log(`💾 Logging activity to database: "${dbName}"`, {
      action: data.action,
      description: data.description,
    });
    
    const Activities = db.collection('activities');
    const now = new Date();

    const activityDocument: Record<string, unknown> = {
      action: data.action,
      description: data.description,
      activityDate: now,
      createdAt: now,
      updatedAt: now,
    };

    // Add optional fields only if they exist
    if (data.applicantId) {
      const objId = toObjectId(data.applicantId);
      if (objId) activityDocument.applicantId = objId;
    }
    if (data.userId) {
      const objId = toObjectId(data.userId);
      if (objId) activityDocument.userId = objId;
    }
    if (data.agent) activityDocument.agent = data.agent;
    if (data.email) activityDocument.email = data.email;
    if (data.createAgent) {
      const objId = toObjectId(data.createAgent);
      if (objId) activityDocument.createAgent = objId;
    }
    if (data.eventId) {
      const objId = toObjectId(data.eventId);
      if (objId) activityDocument.eventId = objId;
    }
    if (data.jobId) {
      const objId = toObjectId(data.jobId);
      if (objId) activityDocument.jobId = objId;
    }
    if (data.venueId) activityDocument.venueId = data.venueId;
    if (data.details || data.detail) {
      activityDocument.details = data.details || data.detail;
    }
    if (data.type) activityDocument.type = data.type;
    if (data.integration) activityDocument.integration = data.integration;
    if (data.hideFromEmployee) activityDocument.hideFromEmployee = data.hideFromEmployee;

    const result = await Activities.insertOne(activityDocument);
    
    // Verify the document was inserted by querying it back
    const insertedDoc = await Activities.findOne({ _id: result.insertedId });
    
    console.log(`✅ Activity logged successfully to database: "${dbName}"`, {
      insertedId: result.insertedId,
      action: data.action,
      description: data.description,
      applicantId: data.applicantId,
      userId: data.userId,
      agent: data.agent,
      email: data.email,
      verified: !!insertedDoc,
      documentExists: insertedDoc ? 'YES' : 'NO',
    });
    
    if (insertedDoc) {
      console.log('📄 Inserted document structure:', {
        _id: insertedDoc._id,
        action: insertedDoc.action,
        description: insertedDoc.description,
        applicantId: insertedDoc.applicantId,
        userId: insertedDoc.userId,
        agent: insertedDoc.agent,
        activityDate: insertedDoc.activityDate,
        createdAt: insertedDoc.createdAt,
        hasDetails: !!insertedDoc.details,
      });
      
      // Test query: Can we find this activity by applicantId?
      if (data.applicantId) {
        const objId = toObjectId(data.applicantId);
        if (objId) {
          const count = await Activities.countDocuments({ applicantId: objId });
          console.log(`🔍 Total activities found for applicantId ${data.applicantId}: ${count}`);
        }
      }
    }
  } catch (error) {
    // Log error but don't throw - activity logging should not break the app
    console.error('❌ Error logging activity:', error, {
      action: data.action,
      description: data.description,
      data,
    });
  }
}

/**
 * Helper to create activity log data with common fields
 * Always includes integration: "Employee App" to identify activities from this app
 */
export function createActivityLogData(
  action: string,
  description: string,
  options: {
    applicantId?: string;
    userId?: string;
    agent?: string;
    email?: string;
    eventId?: string;
    jobId?: string;
    details?: Record<string, unknown>;
    type?: string;
    integration?: string; // Allow override, but default to "Employee App"
  } = {}
): ActivityLogData {
  return {
    action,
    description,
    applicantId: options.applicantId,
    userId: options.userId || options.applicantId, // Default userId to applicantId if not provided
    agent: options.agent,
    email: options.email,
    createAgent: options.userId || options.applicantId,
    eventId: options.eventId,
    jobId: options.jobId,
    details: options.details,
    type: options.type,
    integration: options.integration || 'Employee App', // Always set to "Employee App" by default
  };
}

