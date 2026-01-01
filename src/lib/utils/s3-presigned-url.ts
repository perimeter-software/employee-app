import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Generate S3 pre-signed URL for accessing files in S3
 * @param bucket - S3 bucket name
 * @param key - S3 object key (file path)
 * @param expiresIn - Expiration time in seconds (default: 30 minutes)
 * @returns Pre-signed URL
 */
export async function generateS3PresignedUrl(
  bucket: string,
  key: string,
  expiresIn: number = 1800
): Promise<string> {
  // Validate required environment variables
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION environment variable is required');
  }
  if (!process.env.AWS_ACCESS_KEY_ID) {
    throw new Error('AWS_ACCESS_KEY_ID environment variable is required');
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_SECRET_ACCESS_KEY environment variable is required');
  }

  // Create S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT || `https://s3.${process.env.AWS_REGION}.amazonaws.com`,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // Create GetObject command
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  // Generate pre-signed URL
  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn, // URL expires in specified seconds (default: 30 minutes)
  });

  return presignedUrl;
}

