// lib/services/activity-logger.ts
// Service for logging employee activities to the Big App API

export interface ActivityLogData {
  action: string;
  description: string;
  applicantId?: string;
  userId?: string;
  agent?: string;
  createAgent?: string;
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
 * Get the base URL for the activity logging API
 * Uses production URL by default, dev URL for development
 */
function getActivityApiBaseUrl(): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const useDevApi = process.env.NEXT_PUBLIC_USE_DEV_API === 'true';
  
  if (isDevelopment || useDevApi) {
    return 'https://api.dev.gignology.biz';
  }
  return 'https://api.stadiumpeople.com';
}

/**
 * Log an activity to the Big App API
 * This function is fire-and-forget - errors are logged but don't throw
 */
export async function logActivity(data: ActivityLogData): Promise<void> {
  try {
    const baseUrl = getActivityApiBaseUrl();
    const url = `${baseUrl}/activities`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Activity logging failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        data,
      });
    } else {
      const result = await response.json();
      console.log('Activity logged successfully:', result);
    }
  } catch (error) {
    // Log error but don't throw - activity logging should not break the app
    console.error('Error logging activity:', error, data);
  }
}

/**
 * Helper to create activity log data with common fields
 */
export function createActivityLogData(
  action: string,
  description: string,
  options: {
    applicantId?: string;
    userId?: string;
    agent?: string;
    eventId?: string;
    jobId?: string;
    details?: Record<string, unknown>;
    type?: string;
  } = {}
): ActivityLogData {
  return {
    action,
    description,
    applicantId: options.applicantId,
    userId: options.userId || options.applicantId, // Default userId to applicantId if not provided
    agent: options.agent,
    createAgent: options.userId || options.applicantId,
    eventId: options.eventId,
    jobId: options.jobId,
    details: options.details,
    type: options.type,
  };
}

