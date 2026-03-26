// lib/services/activity-logger.ts
// Service for logging employee activities directly to the database
// This file is server-only and should not be imported in client components

import 'server-only';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { env } from '@/lib/config';

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
    const normalizedData: ActivityLogData = {
      ...data,
      action: (data.action || '').trim(),
      description: (data.description || '').trim(),
      applicantId: data.applicantId ? String(data.applicantId).trim() : undefined,
      userId: data.userId ? String(data.userId).trim() : undefined,
      createAgent: data.createAgent ? String(data.createAgent).trim() : undefined,
      eventId: data.eventId ? String(data.eventId).trim() : undefined,
      jobId: data.jobId ? String(data.jobId).trim() : undefined,
      venueId: data.venueId ? String(data.venueId).trim() : undefined,
      agent: data.agent ? String(data.agent).trim() : undefined,
      email: data.email ? String(data.email).trim().toLowerCase() : undefined,
    };

    // Keep identity fields consistent even for callers that don't use createActivityLogData.
    if (!normalizedData.userId && normalizedData.applicantId) {
      normalizedData.userId = normalizedData.applicantId;
    }
    if (!normalizedData.createAgent && normalizedData.userId) {
      normalizedData.createAgent = normalizedData.userId;
    }

    const dbName = db.databaseName;
    if (env.isDevelopment) {
      console.log(`💾 Logging activity to database: "${dbName}"`, {
        action: normalizedData.action,
        description: normalizedData.description,
      });
    }
    
    const Activities = db.collection('activities');
    const now = new Date();

    // Always set integration and type for Employee App activities
    const integrationValue = data.integration || 'Employee App';
    const typeValue = data.type || 'Employee App';
    
    const activityDocument: Record<string, unknown> = {
      action: normalizedData.action,
      description: normalizedData.description,
      activityDate: now,
      integration: integrationValue,
      type: typeValue,
    };

    // Add optional fields only if they exist
    if (normalizedData.applicantId) {
      activityDocument.applicantId = normalizedData.applicantId;
      const applicantObjectId = toObjectId(normalizedData.applicantId);
      if (applicantObjectId) activityDocument.applicantObjectId = applicantObjectId;
    }
    if (normalizedData.userId) {
      activityDocument.userId = normalizedData.userId;
      const userObjectId = toObjectId(normalizedData.userId);
      if (userObjectId) activityDocument.userObjectId = userObjectId;
    }
    if (normalizedData.agent) activityDocument.agent = normalizedData.agent;
    if (normalizedData.email) activityDocument.email = normalizedData.email;
    if (normalizedData.createAgent) {
      const createAgentObjectId = toObjectId(normalizedData.createAgent);
      if (createAgentObjectId) {
        activityDocument.createAgent = createAgentObjectId;
      } else {
        activityDocument.createAgent = normalizedData.createAgent;
      }
    }
    if (normalizedData.eventId) {
      // Store canonical string ID for consistent querying across all foreign IDs.
      activityDocument.eventId = normalizedData.eventId;
      const eventObjectId = toObjectId(normalizedData.eventId);
      if (eventObjectId) activityDocument.eventObjectId = eventObjectId;
    }
    if (normalizedData.jobId) {
      // Store canonical string ID for consistent querying across all foreign IDs.
      activityDocument.jobId = normalizedData.jobId;
      const jobObjectId = toObjectId(normalizedData.jobId);
      if (jobObjectId) activityDocument.jobObjectId = jobObjectId;
    }
    if (normalizedData.venueId) activityDocument.venueId = normalizedData.venueId;
    if (normalizedData.details || normalizedData.detail) {
      activityDocument.details = normalizedData.details || normalizedData.detail;
    }
    // Override type if explicitly provided (already set above, but allow override)
    if (data.type) activityDocument.type = data.type;
    // Override integration if explicitly provided (already set above, but allow override)
    if (data.integration) activityDocument.integration = data.integration;
    if (data.hideFromEmployee) activityDocument.hideFromEmployee = data.hideFromEmployee;

    const result = await Activities.insertOne(activityDocument);

    if (env.isDevelopment) {
      console.log(`✅ Activity logged successfully to database: "${dbName}"`, {
        insertedId: result.insertedId,
        action: normalizedData.action,
        description: normalizedData.description,
        applicantId: normalizedData.applicantId,
        userId: normalizedData.userId,
        agent: normalizedData.agent,
        email: normalizedData.email,
      });
    }

    // Optional verification in development only (avoid extra DB calls in production path).
    if (env.isDevelopment) {
      const insertedDoc = await Activities.findOne({ _id: result.insertedId });
      if (insertedDoc) {
        console.log('📄 Inserted document structure:', {
          insertedId: result.insertedId,
          _id: insertedDoc._id,
          action: insertedDoc.action,
          description: insertedDoc.description,
          applicantId: insertedDoc.applicantId,
          userId: insertedDoc.userId,
          agent: insertedDoc.agent,
          activityDate: insertedDoc.activityDate,
          hasDetails: !!insertedDoc.details,
        });
      }

      // Test query using canonical string field.
      if (normalizedData.applicantId) {
        const count = await Activities.countDocuments({ applicantId: normalizedData.applicantId });
        console.log(`🔍 Total activities found for applicantId ${normalizedData.applicantId}: ${count}`);
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

