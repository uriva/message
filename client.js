const net = require('net');
const constants = require('./constants');

exports.connectToPeer = function(ipAddress) {
  return Promise((resolve, reject) => {
    const socket = net.connect(constants.PORT, ipAddress, () => {
      resolve(socket);
    });
  });
};
