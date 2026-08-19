// pm2 process config for production deployments (Linux host).
//
// Run with:  pm2 start ecosystem.config.js && pm2 save
//
// Notes:
// - fork mode + 1 instance only: whatsapp-web.js drives a single Chrome
//   instance bound to the LocalAuth session; a second process would fight
//   over the same session lock.
// - watch is off on purpose: a restart relaunches Chrome and can trigger
//   WhatsApp's "can't link new devices" rate limit.
// - kill_timeout gives Nest's shutdown hooks time to destroy Chrome before
//   pm2 sends SIGKILL (otherwise the session lock is left behind).
module.exports = {
  apps: [
    {
      name: 'api-ws',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '900M',
      kill_timeout: 15000,
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
