import Bull from 'bull';

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
    const useTls = process.env.API_REDIS_TLS === 'true';
    const protocol = useTls ? 'rediss' : 'redis';
    const redisUrl =
      process.env.API_REDIS_URL ||
      `${protocol}://${process.env.API_REDIS_HOST}:${process.env.API_REDIS_PORT}`;
    // When TLS is required, pass an explicit options object so ioredis
    // performs the TLS handshake — otherwise the connection hangs.
    queue = useTls
      ? new Bull<FirebaseTopicJob>(QUEUE_NAME, {
          redis: {
            host: process.env.API_REDIS_HOST,
            port: parseInt(process.env.API_REDIS_PORT || '6379'),
            tls: {},
          },
        })
      : new Bull<FirebaseTopicJob>(QUEUE_NAME, redisUrl);
  }
  return queue;
}

export async function enqueueFirebaseTopicJob(
  jobData: FirebaseTopicJob
): Promise<void> {
  await getQueue().add(jobData);
}
