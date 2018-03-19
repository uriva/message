const net = require('net');
const Timeout = require('await-timeout');
const constants = {
  PORT: 9876,
  GET_IP: 'GET_IP',
  IDENTIFY: 'IDENTIFY',
  UPDATE_PEERS: 'UPDATE_PEERS',
  SEARCH_PEER: 'SEARCH_PEER'
};

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
        console.log('got search peer request', publicKey, searchedKey);
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
    this._messageTypeToSubscribe[constants.UPDATE_PEERS] = [
      ({ publicKey, message }) => {
        const peersToUpdate = message.payload;
        console.log('got update peers', publicKey, payload);
        this._publicKeyToIps.extend(peersToUpdate);
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
      console.error(e);
      if (!retriesLeft) {
        return Promise.reject(`Could not create a socket for recipient.`);
      }
      retriesLeft--;
      this._getIp({ publicKey: recipient });
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
    console.log('getting socket', recipient);
    if (recipient in this._publicKeyToSocket) {
      return this._publicKeyToSocket[recipient];
    }
    console.log('current ips', this._publicKeyToIps);
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
      return Promise.reject(`Could not create verified socket, removed IP.`);
    }
  }

  async _createVerifiedSocket({ recipient, ip }) {
    console.log('creating verified socket', recipient, ip);
    let socket;
    try {
      // In the happy flow we have a good IP and connect.
      socket = await connectToPeer({ ip });
    } catch (e) {
      console.error(e);
      return Promise.reject(`Could not create socket to ip.`);
    }
    return new Promise((resolve, reject) => {
      console.log('connected to peer, validating key', ip, recipient);
      socket.on('data', data => {
        if (this._onSocketInitialData({ socket, data })) {
          resolve(socket);
        } else {
          reject('Could not verify signature.');
        }
      });
    });
  }

  // Registers a socket, assumes it was vetted to actually represent the public key.
  _registerSocket({ publicKey, socket }) {
    console.log('registering socket', publicKey);
    socket.on('disconnect', () => {
      delete this._publicKeyToSocket[publicKey];
    });
    this._publicKeyToSocket[publicKey] = socket;
    socket.on('data', data => {
      const message = JSON.parse(data);
      console.log('received data on the wire', message);
      for (cb of this._messageTypeToSubscribe[message.type]) {
        cb({ publicKey, message });
      }
    });
  }

  // Triggers a search for a public key's IP, starting with the closest peer.
  _getIp({ publicKey }) {
    const peers = [...Object.keys(this._publicKeyToIps)];
    if (!peers.length) {
      console.error('No peers to query.');
      return;
    }
    const distances = peers.map(
      distanceBetweenPublicKeys.bind(null, publicKey)
    );
    const minPeer = peers[distances.indexOf(Math.min(...distances))];
    this.sendMessage(
      {
        recipient: minPeer,
        type: constants.SEARCH_PEER,
        payload: { searchedKey: publicKey }
      },
      0,
      0
    ).catch(console.log);
  }

  _onSocketInitialData({ socket, data }) {
    const message = JSON.parse(data);
    console.log('got initial data on socket', message);
    if (
      message.type == constants.IDENTIFY &&
      verifySignature({
        publicKey: message.payload.publicKey,
        signature: message.payload.signature
      })
    ) {
      this._registerSocket({ publicKey: message.payload.publicKey, socket });
      return true;
    }
    return false;
  }

  _createServer() {
    const server = net.createServer(c => {
      console.log('incoming connection, sending credentials');
      c.on('data', data => {
        this._onSocketInitialData({ socket: c, data });
      });
      // Send the client our identity.
      const writeResult = c.write(
        toMessage({
          type: constants.IDENTIFY,
          payload: {
            publicKey: this._publicKey,
            signature: this._createSignature()
          }
        })
      );
    });
    server.on('error', err => {
      throw err;
    });
    server.listen(constants.PORT, () => {
      console.log('server bound', server.address());
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
  return new Promise((resolve, reject) => {
    console.log('setting up socket', constants.PORT, ip);
    const socket = net.connect(constants.PORT, ip, () => {
      console.log('connection successful', ip);
      resolve(socket);
    });
  });
};

// TODO
const verifySignature = function({ publicKey, signature }) {
  return true;
};

// Defines how a message on the network looks like.
const toMessage = function({ type, payload }) {
  return JSON.stringify({ type, payload });
};
