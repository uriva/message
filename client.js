const net = require('net');
const randomPort = require('random-port');
const constants = require('./constants');

exports.connectToPeer = function(ipAddress) {
  return Promise((resolve, reject) => {
    randomPort(port => {
      const socket = net.connect(port, ipAddress, () => {
        resolve(socket);
      });
    });
  });
};
