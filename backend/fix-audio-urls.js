/**
 * One-time fix: update old audio message attachment_urls to include
 * the download token and the full origin URL (so they work cross-origin
 * in the split architecture where files are on afridiwins but the app
 * is on ehcserver).
 *
 * Usage: cd backend && node fix-audio-urls.js
 * Run on the VPS where the files are stored (afridiwins for old messages).
 */
require('dotenv').config();
const crypto = require('crypto');
const { sequelize } = require('./config/database');
const Message = require('./models/Message');

// The public base URL of this server (where files are stored).
const PUBLIC_URL = process.env.MINIO_PUBLIC_BASE_URL
  || `https://${process.env.DOMAIN || 'afridiwins.online'}`;
const BASE_ORIGIN = PUBLIC_URL.replace(/\/files$/, '').replace(/\/$/, '');

async function fix() {
  const DOWNLOAD_SECRET = process.env.FILE_DOWNLOAD_SECRET;
  if (!DOWNLOAD_SECRET) {
    console.error('FILE_DOWNLOAD_SECRET not set in .env');
    process.exit(1);
  }

  // Find all audio messages with relative URLs (no token or no origin)
  const messages = await Message.findAll({
    where: {
      type: 'audio',
      attachment_url: { [require('sequelize').Op.like]: '/api/files/%/download%' },
    },
  });

  console.log(`Found ${messages.length} audio messages with relative URLs`);
  console.log(`Base origin: ${BASE_ORIGIN}`);

  let fixed = 0;
  for (const msg of messages) {
    const url = msg.attachment_url || '';
    // Extract file ID from URL: /api/files/{id}/download or /api/files/{id}/download?token=xxx
    const match = url.match(/\/api\/files\/([^/]+)\/download/);
    if (!match) {
      console.log(`  Skipping ${msg.id}: could not parse file ID from ${url}`);
      continue;
    }
    const fileId = match[1];
    // Check if token already exists
    const existingTokenMatch = url.match(/token=([^&]+)/);
    const token = existingTokenMatch
      ? existingTokenMatch[1]
      : crypto.createHmac('sha256', DOWNLOAD_SECRET).update(fileId).digest('hex');
    const newUrl = `${BASE_ORIGIN}/api/files/${fileId}/download?token=${token}`;
    await msg.update({ attachment_url: newUrl });
    console.log(`  Fixed ${msg.id}: ${newUrl}`);
    fixed++;
  }

  console.log(`Done. Fixed ${fixed} of ${messages.length} messages.`);
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
