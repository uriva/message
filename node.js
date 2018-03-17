const Timeout = require('await-timeout');
const utils = require('./utils');
const constants = require('./constants');

exports.Node = class {
  // All param are strings.
  constructor({ publicKey, privateKey, bootstrapIpMap }) {
    this._publicKey = publicKey;
    this._privateKey = privateKey;
    this._publicKeyToSocket = {};
    this._publicKeyToIps = bootstrapIpMap;
    // Maps string to array of callbacks.
    this._messageTypeToSubscribe = {};
  }

  // Returns a promise of true/false if the message passed through.
  // All params are strings.
  async sendMessage(
    { recipient, type, payload },
    retriesLeft,
    waitBetweenRetries
  ) {
    try {
      const socket = await this._getSocket({ recipient });
      return socket.write(utils.toMessage({ type, payload }));
    } catch (e) {
      if (!retriesLeft) {
        return Promise.reject(
          `Could not create a socket for recipient (${e}).`
        );
      }
      retriesLeft--;
      this._getIp({ recipient });
      const timeout = new Timeout();
      await timeout.set(waitBetweenRetries);
      return this.sendMessage(
        { recipient, type, payload },
        retriesLeft,
        waitBetweenRetries * 2
      );
    }
  }

  async subscribe(messageType, callback) {
    if (!this._messageTypeToSubscribe[messageType]) {
      this._messageTypeToSubscribe[messageType] = [];
    }
    this._messageTypeToSubscribe[messageType].push(callback);
  }

  // Returns a socket for given recipient.
  async _getSocket({ recipient }) {
    console.log('getting socket');
    if (this._publicKeyToSocket[recipient]) {
      return this._publicKeyToSocket[recipient];
    }
    if (!this._publicKeyToIps[recipient]) {
      return Promise.reject('No active socket and no IP.');
    }
    try {
      return await this._createVerifiedSocket({
        recipient,
        ip: this._publicKeyToIps[recipient]
      });
    } catch (e) {
      delete this._publicKeyToIps[recipient];
      return Promise.reject(
        `Could not create verified socket, removed IP (${e}).`
      );
    }
  }

  async _createVerifiedSocket({ recipient, ip }) {
    try {
      // In the happy flow we have a good IP and connect.
      const socket = await client.connectToPeer(ip);
    } catch (e) {
      return Promise.reject(`Could not create socket to ip. (${e})`);
    }
    return Promise((resolve, reject) => {
      socket.on('validate', data => {
        if (!verifySignature(recipient, data)) {
          reject('Could not verify signature.');
          return;
        }
        socket.on('disconnect', () => {
          delete this._publicKeyToSocket[recipient];
        });
        socket.on('data', data => {
          const message = JSON.parse(data);
          for (cb of this._messageTypeToSubscribe[message.type]) {
            cb(message);
          }
        });
        this._publicKeyToSocket[recipient] = socket;
        resolve(socket);
      });
    });
  }

  // Triggers a search for a public key's IP.
  _getIp({ recipient }) {
    const peers = [...Object.keys(this._publicKeyToIps)];
    const distances = peers.map(
      distanceBetweenPublicKeys.bind(null, recipient)
    );
    // Upon a cache miss, query the closest peer for the missing IP.
    const minPeer = peers[distances.indexOf(Math.min(...distances))];
    if (!minPeer) {
      console.error('No peers to query, need to bootstrap some peers.');
      return;
    }
    this.sendMessage(
      {
        recipient: minPeer,
        type: constants.GET_IP,
        payload: recipient
      },
      0,
      0
    ).catch(console.log);
  }
};

// TODO
const verifySignature = function({ publicKey, signature }) {
  return true;
};

// TODO
const distanceBetweenPublicKeys = function({ k1, k2 }) {
  return 1;
};
