const { Sequelize } = require('sequelize');
require('dotenv').config({ path: '.env' });

// Simple database configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || 'sehat_connect',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || null,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      // Enable array support for PostgreSQL
      prependUnknown: true
    }
  }
);

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Ensure PostgreSQL service is running');
    console.log('2. Check DB credentials in env.example');
    console.log('3. Try different passwords: empty, "postgres", "123456"');
    console.log('4. Use pgAdmin to check your actual credentials');
    return false;
  }
};

// Sync database models (create tables if they don't exist)
const syncDatabase = async () => {
  try {
    // In production, only create missing tables — never alter existing ones
    // (alter can cause data loss). Use migrations for schema changes in prod.
    const force = process.env.NODE_ENV === 'production' ? false : false;
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    console.error('❌ Database synchronization failed:', error.message);
  }
};

// Create database if it doesn't exist
const createDatabase = async () => {
  try {
    const sequelizeForCreation = new Sequelize('postgres', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || null, {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    });

    try {
      // Check if database exists
      const [results] = await sequelizeForCreation.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        {
          bind: [process.env.DB_NAME || 'sehat_connect'],
          type: Sequelize.QueryTypes.SELECT
        }
      );

      if (!results || results.length === 0) {
        // Database doesn't exist, create it
        await sequelizeForCreation.query(`CREATE DATABASE ${process.env.DB_NAME || 'sehat_connect'};`);
        console.log('✅ Database created successfully');
      } else {
        console.log('✅ Database already exists');
      }
    } catch (error) {
      console.log('ℹ️  Database creation skipped:', error.message);
    } finally {
      await sequelizeForCreation.close();
    }
  } catch (error) {
    console.log('ℹ️  Database creation skipped:', error.message);
  }
};

module.exports = { sequelize, testConnection, syncDatabase, createDatabase };
