const nodeLib = require('./node');
const colors = require('colors');

const test = async function() {
  const alice = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.magenta('Alice'), ...args);
    },
    publicKey: 0,
    privateKey: 0,
    bootstrapPhysicalAddresses: {},
    subscriber: console.log
  });
  const bob = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.yellow('Bob'), ...args);
    },
    publicKey: 1,
    privateKey: 1,
    bootstrapPhysicalAddresses: {
      '0': { ip: 'localhost', port: alice._port }
    },
    subscriber: console.log
  });
  const nodes = [alice, bob];
  try {
    const status = await bob.sendMessage(
      { recipient: 0, type: 'bla', payload: 'hello Alice' },
      3,
      1000
    );
    console.log(
      status
        ? colors.green('sent message')
        : colors.red('could not send message')
    );
  } catch (e) {
    console.error('some error', e);
  }
};

test();
