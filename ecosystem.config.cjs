module.exports = {
  apps: [
    {
      name: 'clt-v8-api',
      script: 'server.js',
      cwd: '/opt/lunas-digital/clt-v8-service',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        NODE_OPTIONS: '--max-old-space-size=4096'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        NODE_OPTIONS: '--max-old-space-size=4096'
      },
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '3584M',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      kill_timeout: 5000
    },
    {
      name: 'clt-v8-api-5000',
      script: 'server-5000.js',
      cwd: '/opt/lunas-digital/clt-v8-service',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
        NODE_OPTIONS: '--max-old-space-size=4096'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        NODE_OPTIONS: '--max-old-space-size=4096'
      },
      log_file: 'logs/combined-5000.log',
      out_file: 'logs/out-5000.log',
      error_file: 'logs/error-5000.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '3584M',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      kill_timeout: 5000
    }
  ]
};