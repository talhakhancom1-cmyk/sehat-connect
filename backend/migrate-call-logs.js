/**
 * One-time migration: add 'call' to the message type enums and add
 * call-related columns to the messages table.
 *
 * Usage: cd backend && node migrate-call-logs.js
 */
require('dotenv').config();
const { sequelize } = require('./config/database');

async function migrate() {
  console.log('Adding call type to message enums...');

  // Add 'call' to the type enum
  await sequelize.query("ALTER TYPE enum_messages_type ADD VALUE IF NOT EXISTS 'call'");
  await sequelize.query("ALTER TYPE enum_messages_message_type ADD VALUE IF NOT EXISTS 'call'");

  console.log('Adding call-related columns...');

  // Add call-specific columns (IF NOT EXISTS)
  await sequelize.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_direction VARCHAR(20)");
  await sequelize.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_status VARCHAR(20)");
  await sequelize.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_duration INTEGER");
  await sequelize.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_type VARCHAR(10)");

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
