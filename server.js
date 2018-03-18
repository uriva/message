const net = require('net');
const constants = require('./constants');
const peers = require('./peers');

exports.createServer = function(cb) {
  const server = net.createServer(c => {
    c.on('data', cb);
  });
  server.listen(constants.port, () => {});
};
