const { makeNode } = require('./index');
makeNode({
  logger: console.log,
  publicKey: '00',
  privateKey: '00',
  app: '0',
  bootstrapPhysicalAddresses: {},
  subscriber: console.log
});
