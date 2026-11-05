'use strict';

const {createApplication} = require('./src/application');
const {createStore} = require('./src/store');

if (require.main === module) {
  const demo = process.argv.includes('--demo');
  createStore({
    demo
  }).then(store => {
    const instance = createApplication(store, {
      demo
    });
    const port = Number(process.env.PORT || 3000);
    instance.server.on('error', error => {
      console.error(`Unable to listen on port ${port}: ${error.code || error.message}. Check local network permissions and port availability.`);
      instance.close().finally(() => {
        process.exitCode = 1;
      });
    });
    instance.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`SafeTap: http://${process.env.HOST || '127.0.0.1'}:${port} (${demo ? 'DEMO — fictional data / file storage' : 'MySQL'})`));
    process.on('SIGTERM', () => instance.close().then(() => process.exit()));
    process.on('SIGINT', () => instance.close().then(() => process.exit()));
  }).catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = {createApplication};
