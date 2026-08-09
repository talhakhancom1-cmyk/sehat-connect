const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// MinIO is fully S3-compatible. We use the AWS SDK v3 with custom endpoint.
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables are required');
}

const endpoint = process.env.MINIO_USE_SSL === 'true'
  ? `https://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
  : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`;

const s3Client = new S3Client({
  region: 'us-east-1', // MinIO ignores this but AWS SDK requires it
  endpoint,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO (path-style, not virtual-host)
});

const BUCKET = process.env.MINIO_BUCKET || 'sehat-uploads';
const PUBLIC_BASE_URL = process.env.MINIO_PUBLIC_BASE_URL || '';

// Ensure the bucket exists on startup
async function ensureBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`✅ MinIO bucket "${BUCKET}" exists.`);
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
        console.log(`✅ MinIO bucket "${BUCKET}" created.`);
      } catch (createErr) {
        console.error(`❌ Failed to create MinIO bucket: ${createErr.message}`);
      }
    } else {
      console.error(`❌ MinIO bucket check failed: ${err.message}`);
    }
  }
}

// Upload a file to MinIO
async function uploadFile(key, body, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
  return key;
}

// Download a file stream from MinIO
async function getFileStream(key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const response = await s3Client.send(command);
  return response.Body; // Readable stream
}

// Delete a file from MinIO
async function deleteFile(key) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3Client.send(command);
}

// Generate a presigned download URL (valid for `expiresIn` seconds)
async function getPresignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

// Build the public URL for a stored object key
function buildPublicUrl(key) {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL}/${key}`;
  }
  return `${endpoint}/${BUCKET}/${key}`;
}

module.exports = {
  s3Client,
  BUCKET,
  ensureBucket,
  uploadFile,
  getFileStream,
  deleteFile,
  getPresignedDownloadUrl,
  buildPublicUrl,
};
