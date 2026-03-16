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
    const redisUrl =
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
    queue = new Bull<FirebaseTopicJob>(QUEUE_NAME, redisUrl);
  }
  return queue;
}

export async function enqueueFirebaseTopicJob(
  jobData: FirebaseTopicJob
): Promise<void> {
  await getQueue().add(jobData);
}
