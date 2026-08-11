module.exports = {
  apps: [{
    name: 'ecohealth-backend',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    // Load .env file (PM2 >= 5 supports this)
    env_file: '.env',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 3000,
    listen_timeout: 8000,
  }],
};
