const nodeLib = require('./node');
const colors = require('colors');

const test = async function() {
  const alice = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.magenta('Alice'), ...args);
    },
    publicKey: '000',
    privateKey: '0',
    bootstrapPhysicalAddresses: {},
    subscriber: (...args) => console.log('alice got message', args)
  });
  const bob = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.yellow('Bob'), ...args);
    },
    publicKey: '001',
    privateKey: '1',
    bootstrapPhysicalAddresses: {
      '000': { ip: 'localhost', port: alice._port }
    },
    subscriber: (...args) => console.log('bob got message', args)
  });
  const eve = await nodeLib.makeNode({
    logger: (...args) => {
      console.log(colors.blue('Eve'), ...args);
    },
    publicKey: '111',
    privateKey: '2',
    bootstrapPhysicalAddresses: {
      '000': { ip: 'localhost', port: alice._port }
    },
    subscriber: (...args) => console.log('eve got message', args)
  });
  const nodes = [alice, bob];
  try {
    await bob.sendMessage(
      { recipient: '000', type: 'bla', payload: 'hello Alice' },
      3,
      1000
    );
    console.log(colors.green('sent message'));
  } catch (e) {
    console.error(colors.red('some error'), e);
  }
  try {
    await eve.sendMessage(
      {
        recipient: '001',
        type: 'bla',
        payload: 'hello Bob I got your IP from Alice'
      },
      3,
      1000
    );
    console.log(colors.green('sent message'));
  } catch (e) {
    console.error(colors.red('some error'), e);
  }
};

test();
