const { makeNode } = require('./index');
makeNode({
  logger: console.log,
  publicKey: '0',
  privateKey: '1',
  app: '0',
  bootstrapPhysicalAddresses: {},
  subscriber: console.log,
  listenPort: '45345'
});
