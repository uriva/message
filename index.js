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
    subscriber: (...args) => console.log('alice got message', args)
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
    subscriber: (...args) => console.log('bob got message', args)
  });
  const eve = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.blue('Bob'), ...args);
    },
    publicKey: 2,
    privateKey: 2,
    bootstrapPhysicalAddresses: {
      '0': { ip: 'localhost', port: alice._port }
    },
    subscriber: (...args) => console.log('eve got message', args)
  });
  const nodes = [alice, bob];
  try {
    await bob.sendMessage(
      { recipient: 0, type: 'bla', payload: 'hello Alice' },
      3,
      1000
    );
    console.log(colors.green('sent message'));
  } catch (e) {
    console.error(colors.red('some error'), e);
  }
  try {
    await eve.sendMessage(
      { recipient: 1, type: 'bla', payload: 'hello Bob I got your IP from Alice' },
      3,
      1000
    );
    console.log(colors.green('sent message'));
  } catch (e) {
    console.error(colors.red('some error'), e);
  }
};

test();
