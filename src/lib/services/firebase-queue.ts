import Bull from 'bull';
import { IS_V4 } from '@/lib/config/auth-mode';

export interface FirebaseTopicJob {
  jobType: 'subscribe' | 'unsubscribe';
  topicName: string;
  fcmTokens: string[];
}

const QUEUE_NAME = 'firebase-topic-queue';

// Lazily create the queue so it doesn't attempt to connect at import time
let queue: Bull.Queue<FirebaseTopicJob> | null = null;

function getQueue(): Bull.Queue<FirebaseTopicJob> {
  if (!queue) {
    if (IS_V4) {
      // V4 ElastiCache is cluster mode + TLS. Hash-tag prefix matches
      // gig-v4-backend's QUEUE_PREFIX so the same firebase-push worker
      // consumes our jobs.
      queue = new Bull<FirebaseTopicJob>(QUEUE_NAME, {
        prefix: '{v4}',
        redis: {
          host: process.env.API_REDIS_HOST,
          port: parseInt(process.env.API_REDIS_PORT || '6379'),
          tls: {},
        },
      });
    } else {
      const redisUrl =
        process.env.API_REDIS_URL ||
        `redis://${process.env.API_REDIS_HOST}:${process.env.API_REDIS_PORT}`;
      queue = new Bull<FirebaseTopicJob>(QUEUE_NAME, redisUrl);
    }
  }
  return queue;
}

export async function enqueueFirebaseTopicJob(
  jobData: FirebaseTopicJob
): Promise<void> {
  await getQueue().add(jobData);
}
