const net = require('net');
const constants = require('./constants');
const peers = require('./peers');

const server = net.createServer(c => {
  c.on('data', msg => {
    const parsed = JSON.parse(data.toString());
    if (parsed.type == constants.SEARCH_PEER) {
      c.write(
        JSON.stringify({ type: constants.UPDATE_PEERS, peersMap: peers.idToIp })
      );
    }
  });
});
server.listen(constants.port, () => {});
