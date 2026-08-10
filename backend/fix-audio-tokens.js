// One-time fix: regenerate download tokens for audio messages
// after FILE_DOWNLOAD_SECRET was synced with ehcserver.
require('dotenv').config();
const crypto = require('crypto');
const { sequelize } = require('./config/database');
const Message = require('./models/Message');

const BASE_ORIGIN = 'https://afridiwins.online';

async function fix() {
  const DOWNLOAD_SECRET = process.env.FILE_DOWNLOAD_SECRET;
  if (!DOWNLOAD_SECRET) {
    console.error('FILE_DOWNLOAD_SECRET not set');
    process.exit(1);
  }

  // Find all audio messages with full URLs (already migrated)
  const messages = await Message.findAll({
    where: {
      type: 'audio',
      attachment_url: { [require('sequelize').Op.like]: '%/api/files/%/download%' },
    },
  });

  console.log(`Found ${messages.length} audio messages to re-token`);
  let fixed = 0;
  for (const msg of messages) {
    const url = msg.attachment_url || '';
    const match = url.match(/\/api\/files\/([^/]+)\/download/);
    if (!match) continue;
    const fileId = match[1];
    const token = crypto.createHmac('sha256', DOWNLOAD_SECRET).update(fileId).digest('hex');
    const newUrl = `${BASE_ORIGIN}/api/files/${fileId}/download?token=${token}`;
    await msg.update({ attachment_url: newUrl });
    console.log(`  Re-tokened ${msg.id}`);
    fixed++;
  }
  console.log(`Done. Fixed ${fixed} of ${messages.length}.`);
  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
