module.exports = {
  apps : [
    {
      'name': 'VisboReST',
      'script': 'app.js',

      // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
      'instances': 1,
      'instance_var': 'INSTANCE_ID',
      'exec_mode' : 'cluster',
      'autorestart': true,
      'watch': false,
      'max_memory_restart': '1G',
      'env': { NODE_ENV: 'development' },
      'env_production': { NODE_ENV: 'production' }
    }
  ],
};
