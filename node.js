const net = require('net');
const Timeout = require('await-timeout');
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
    this._messageTypeToSubscribe[constants.SEARCH_PEER] = [
      ({ publicKey, message }) => {
        const searchedKey = message.payload.searchedKey;
        if (searchedKey in self._publicKeyToIps) {
          const payload = {};
          payload[searchedKey] = self._publicKeyToIps[searchedKey];
          this.sendMessage({
            recipient: publicKey,
            type: constants.UPDATE_PEERS,
            payload
          });
        }
      }
    ];
    this._createServer();
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
      return socket.write(toMessage({ type, payload }));
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
      await this._createVerifiedSocket({
        recipient,
        ip: this._publicKeyToIps[recipient]
      });
      return this._publicKeyToSocket[recipient];
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
      const socket = await connectToPeer({ ip });
    } catch (e) {
      return Promise.reject(`Could not create socket to ip. (${e})`);
    }
    return Promise((resolve, reject) => {
      socket.on('data', data => {
        if (this._onSocketInitialData(data)) {
          resolve();
        } else {
          reject('Could not verify signature.');
        }
      });
    });
  }

  // Registers a socket, assumes it was vetted to actually represent the public key.
  _registerSocket({ publicKey, socket }) {
    socket.on('disconnect', () => {
      delete this._publicKeyToSocket[recipient];
    });
    this._publicKeyToSocket[recipient] = socket;
    socket.on('data', data => {
      const message = JSON.parse(data);
      for (cb of this._messageTypeToSubscribe[message.type]) {
        cb({ publicKey, message });
      }
    });
  }

  // Triggers a search for a public key's IP.
  _getIp({ recipient }) {
    const peers = [this._publicKey, ...Object.keys(this._publicKeyToIps)];
    const distances = peers.map(
      distanceBetweenPublicKeys.bind(null, recipient)
    );
    // Upon a cache miss, query the closest peer for the missing IP.
    const minPeer = peers[distances.indexOf(Math.min(...distances))];
    if (!minPeer || minPeer == this._publicKey) {
      console.error('No better peers to query.');
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

  _onSocketInitialData(data) {
    const message = JSON.parse(data);
    if (
      message.type == constants.IDENTIFY &&
      verifySignature({
        publicKey: message.payload.publicKey,
        signature: message.payload.signature
      })
    ) {
      this._registerSocket({ publicKey: message.publicKey, socket: c });
      return true;
    }
    return false;
  }

  _createServer() {
    const server = net.createServer(c => {
      // Send the client our identity.
      c.write(
        toMessage({
          type: constants.IDENTIFY,
          payload: {
            publicKey: this._publicKey,
            signature: this._createSignature()
          }
        })
      );
      c.on('data', this._onSocketInitialData.bind(this));
    });
    server.listen(constants.PORT, () => {
      console.log(`server listening on ${JSON.stringify(server.address())}`);
    });
  }

  // TODO
  _createSignature() {
    return 0;
  }
};

// TODO
const distanceBetweenPublicKeys = function({ k1, k2 }) {
  return 1;
};

const connectToPeer = function({ ip }) {
  return Promise((resolve, reject) => {
    const socket = net.connect(constants.PORT, ip, () => {
      resolve(socket);
    });
  });
};

// TODO
const verifySignature = function({ publicKey, signature }) {
  return True;
};

// Defines how a message on the network looks like.
const toMessage = function({ type, payload }) {
  return JSON.stringify({ type, payload });
};
