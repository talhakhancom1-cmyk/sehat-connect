const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { UploadedFile } = require('../models');
const { authenticate } = require('../middleware/auth');
const { uploadFile, getFileStream, deleteFile, ensureBucket, buildPublicUrl, getPresignedDownloadUrl } = require('../config/minio');
const { canAccessFile } = require('../lib/ownership');
const { validateFileType, sanitizeError } = require('../lib/validate');

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/webm;codecs=opus',
  'video/webm',
  'video/mp4',
];

const router = express.Router();

// Use memory storage so we can stream directly to MinIO
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const DOWNLOAD_SECRET = process.env.FILE_DOWNLOAD_SECRET;
if (!DOWNLOAD_SECRET) {
  throw new Error('FILE_DOWNLOAD_SECRET environment variable is required');
}

function signDownloadToken(fileId) {
  return crypto.createHmac('sha256', DOWNLOAD_SECRET).update(fileId).digest('hex');
}

// Ensure MinIO bucket exists on module load
ensureBucket().catch((err) => {
  console.error('MinIO initialization warning:', err.message);
});

// POST /api/files/upload
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    // --- Server-side validation: reject dangerous file types ---
    const typeErr = validateFileType(req.file.mimetype, ALLOWED_MIME_TYPES, 'file');
    if (typeErr) return res.status(400).json({ error: typeErr });

    // Generate a unique key for the object
    const ext = req.file.originalname ? '.' + req.file.originalname.split('.').pop() : '';
    const key = `${crypto.randomBytes(16).toString('hex')}${ext}`;

    // Upload to MinIO
    await uploadFile(key, req.file.buffer, req.file.mimetype);

    const record = await UploadedFile.create({
      owner_id: req.user.id,
      original_name: req.file.originalname,
      stored_name: key, // Now stores the MinIO object key
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      purpose: req.body && req.body.purpose,
      status: 'active',
    });

    const fileUrl = `/api/files/${record.id}/download`;
    await record.update({ file_url: fileUrl });

    res.status(201).json({
      id: record.id,
      file_url: fileUrl,
      download_token: signDownloadToken(record.id),
      original_name: record.original_name,
      mime_type: record.mime_type,
      size_bytes: record.size_bytes,
    });
  } catch (error) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// GET /api/files/:fileId/download
router.get('/:fileId/download', async (req, res) => {
  try {
    const file = await UploadedFile.findByPk(req.params.fileId);
    if (!file || file.status === 'deleted') {
      return res.status(404).json({ error: 'File not found' });
    }

    const providedToken = req.query.token;
    const expectedOwnerToken = signDownloadToken(file.id);
    const isOwnerToken = providedToken === expectedOwnerToken;
    const isValidShareToken = file.shared_token
      && providedToken === file.shared_token
      && file.status === 'active'
      && (!file.shared_token_expires_at || new Date(file.shared_token_expires_at) > new Date());

    // Allow authenticated access via Bearer header, ?auth=<jwt> query param,
    // or ehc_token cookie (browser <img>/<a> tags can't send Authorization headers)
    const authHeader = req.headers.authorization;
    const authToken = req.query.auth;
    const cookieToken = req.cookies && req.cookies.ehc_token;
    let isAuthed = false;
    const tokenToCheck = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : (authToken || cookieToken);
    if (tokenToCheck) {
      try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET;
        if (JWT_SECRET) jwt.verify(tokenToCheck, JWT_SECRET);
        isAuthed = true;
      } catch (e) { /* invalid token */ }
    }

    if (!isOwnerToken && !isValidShareToken && !isAuthed) {
      return res.status(403).json({ error: 'Invalid or expired download token' });
    }

    // Stream the file from MinIO
    const stream = await getFileStream(file.stored_name);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    if (file.original_name) {
      res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`);
    }
    stream.pipe(res);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'File content missing in storage' });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/files/:fileId/share
router.post('/:fileId/share', authenticate, async (req, res) => {
  try {
    const file = await UploadedFile.findByPk(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!canAccessFile({ uploaded_by_user_id: file.owner_id }, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this file' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresInHours = Number(req.body && req.body.expires_in_hours) || 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    await file.update({ shared_token: token, shared_token_expires_at: expiresAt });
    res.json({
      file_id: file.id,
      token,
      expires_at: expiresAt,
      share_url: `/api/files/${file.id}/download?token=${token}`,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/files/:fileId/revoke
router.post('/:fileId/revoke', authenticate, async (req, res) => {
  try {
    const file = await UploadedFile.findByPk(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!canAccessFile({ uploaded_by_user_id: file.owner_id }, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this file' });
    }
    await file.update({ shared_token: null, shared_token_expires_at: null, status: 'revoked' });
    res.json({ message: 'Share revoked' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/files/:fileId — also remove from MinIO
router.delete('/:fileId', authenticate, async (req, res) => {
  try {
    const file = await UploadedFile.findByPk(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!canAccessFile({ uploaded_by_user_id: file.owner_id }, req.user)) {
      return res.status(403).json({ error: 'Forbidden — you do not have access to this file' });
    }
    // Delete from MinIO (best-effort)
    try {
      await deleteFile(file.stored_name);
    } catch (e) {
      console.error('MinIO delete failed (non-fatal):', e.message);
    }
    await file.update({ status: 'deleted' });
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
