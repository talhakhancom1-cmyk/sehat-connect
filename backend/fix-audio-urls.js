/**
 * One-time fix: update old audio message attachment_urls to include
 * the download token. Run on the VPS where the files are stored.
 *
 * Usage: cd backend && node fix-audio-urls.js
 */
require('dotenv').config();
const crypto = require('crypto');
const { sequelize } = require('./config/database');
const Message = require('./models/Message');
const UploadedFile = require('./models/UploadedFile');

async function fix() {
  const DOWNLOAD_SECRET = process.env.FILE_DOWNLOAD_SECRET;
  if (!DOWNLOAD_SECRET) {
    console.error('FILE_DOWNLOAD_SECRET not set in .env');
    process.exit(1);
  }

  // Find all audio messages with relative URLs (no token)
  const messages = await Message.findAll({
    where: {
      type: 'audio',
      attachment_url: { [require('sequelize').Op.like]: '/api/files/%/download' },
    },
  });

  console.log(`Found ${messages.length} audio messages to fix`);

  let fixed = 0;
  for (const msg of messages) {
    const url = msg.attachment_url || '';
    if (url.includes('token=')) continue; // already has token
    // Extract file ID from URL: /api/files/{id}/download
    const match = url.match(/\/api\/files\/([^/]+)\/download/);
    if (!match) {
      console.log(`  Skipping ${msg.id}: could not parse file ID from ${url}`);
      continue;
    }
    const fileId = match[1];
    const token = crypto.createHmac('sha256', DOWNLOAD_SECRET).update(fileId).digest('hex');
    const newUrl = `/api/files/${fileId}/download?token=${token}`;
    await msg.update({ attachment_url: newUrl });
    console.log(`  Fixed ${msg.id}: ${newUrl}`);
    fixed++;
  }

  console.log(`Done. Fixed ${fixed} of ${messages.length} messages.`);
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
