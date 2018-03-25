const net = require('net');
const JsonSocket = require('json-socket');
const Timeout = require('await-timeout');
const constants = {
  PORT: 9876,
  GET_PHYSICAL_ADDRESS: 'GET_PHYSICAL_ADDRESS',
  IDENTIFY: 'IDENTIFY',
  UPDATE_PEERS: 'UPDATE_PEERS',
  SEARCH_PEER: 'SEARCH_PEER'
};

exports.makeNode = async function(args) {
  const node = new Node(args);
  await node.createServer();
  return node;
};

const Node = class {
  // All param are strings.
  // See README for what the private key is.
  constructor({
    logger,
    publicKey,
    privateKey,
    app,
    bootstrapPhysicalAddresses,
    subscriber
  }) {
    this._logger = logger;
    this._publicKey = publicKey;
    this._app = app;
    this._privateKey = privateKey;
    this._publicKeyToSocket = {};
    this._publicKeyToPhysicalAddress = bootstrapPhysicalAddresses;
    this._externalSubscriber = subscriber;
  }

  _handleMessage({ publicKey, message }) {
    if (message.type == constants.SEARCH_PEER) {
      this._logger('got search peer request', publicKey, message);
      const searchedKey = message.payload.searchedKey;
      if (searchedKey in this._publicKeyToPhysicalAddress) {
        const payload = {};
        payload[searchedKey] = this._publicKeyToPhysicalAddress[searchedKey];
        this.sendMessage({
          recipient: publicKey,
          type: constants.UPDATE_PEERS,
          payload
        });
      }
    } else if (message.type == constants.UPDATE_PEERS) {
      this._logger('got update peers request', publicKey, message);
      Object.assign(this._publicKeyToPhysicalAddress, message.payload);
    } else {
      this._externalSubscriber({ publicKey, message });
    }
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
      const promise = new Promise((resolve, reject) => {
        socket.sendMessage(toMessage({ type, payload }), resolve);
      });
      return promise;
    } catch (e) {
      if (!retriesLeft) {
        console.error('Could not create or use a socket for recipient', e);
      }
      delete this._publicKeyToSocket[recipient];
      if (!retriesLeft) {
        return Promise.reject('Could not create a socket for recipient.');
      }
      retriesLeft--;
      this._getPhysicalAddress({ publicKey: recipient });
      const timeout = new Timeout();
      await timeout.set(waitBetweenRetries);
      return this.sendMessage(
        { recipient, type, payload },
        retriesLeft,
        waitBetweenRetries * 2
      );
    }
  }

  // Returns a socket for given recipient.
  async _getSocket({ recipient }) {
    this._logger('getting socket', recipient);
    if (recipient in this._publicKeyToSocket) {
      return this._publicKeyToSocket[recipient];
    }
    this._logger(
      'current physical addresses',
      this._publicKeyToPhysicalAddress
    );
    if (!this._publicKeyToPhysicalAddress[recipient]) {
      return Promise.reject('No active socket and no physical address.');
    }
    try {
      return await this._createVerifiedSocket({
        recipient,
        physicalAddress: this._publicKeyToPhysicalAddress[recipient]
      });
    } catch (e) {
      delete this._publicKeyToPhysicalAddress[recipient];
      return Promise.reject(
        'Could not create verified socket, removed physical address.'
      );
    }
  }

  async _createVerifiedSocket({ recipient, physicalAddress }) {
    this._logger('creating verified socket', recipient, physicalAddress);
    try {
      // In the happy flow we have a good physical address and connect.
      const socket = await this._connectToPeer(physicalAddress);
      return this._prepareSocket(socket);
    } catch (e) {
      console.error('Could not create socket to physical address', e);
      return Promise.reject('Could not create socket to physical address.');
    }
  }

  // Registers a socket, assumes it was vetted to actually represent the public key.
  _registerSocket({ publicKey, socket }) {
    this._logger('registering socket', publicKey);
    this._publicKeyToSocket[publicKey] = socket;
    const address = socket._socket.address();
    this._publicKeyToPhysicalAddress[publicKey] = {
      ip: address.address,
      port: address.port
    };
  }

  // Triggers a search for a public key's physical address, starting with the closest peer.
  _getPhysicalAddress({ publicKey }) {
    const peers = [...Object.keys(this._publicKeyToPhysicalAddress)];
    if (!peers.length) {
      console.error('No peers to query.');
      return;
    }
    const distances = peers.map(
      distanceBetweenPublicKeys.bind(null, publicKey)
    );
    const minPeer = peers[distances.indexOf(Math.min(...distances))];
    try {
      this.sendMessage(
        {
          recipient: minPeer,
          type: constants.SEARCH_PEER,
          payload: { searchedKey: publicKey }
        },
        0,
        0
      );
    } catch (e) {
      console.error('error sending message', e);
    }
  }

  _prepareSocket(socket) {
    this._logger('handling new socket');
    // Send the client our identity.
    this._logger('sending own credentials');
    const writeResult = socket.sendMessage(
      toMessage({
        type: constants.IDENTIFY,
        payload: {
          publicKey: this._publicKey,
          signature: this._createSignature()
        }
      })
    );
    this._logger('waiting for credentials');
    return new Promise((resolve, reject) => {
      socket.on('message', message => {
        if (!socket.gotFirstMessage) {
          socket.gotFirstMessage = true;
          this._logger('got initial data on socket', message);
          if (message.type != constants.IDENTIFY) {
            console.error('unexepected first message on wire', message);
            reject('unexpected first message');
            return;
          }
          if (
            !verifySignature({
              publicKey: message.payload.publicKey,
              signature: message.payload.signature,
              app: this._app
            })
          ) {
            reject('could not verify signature');
            socket.on('message', () => {});
            return;
          }
          this._logger('verified signature');
          this._registerSocket({
            publicKey: message.payload.publicKey,
            socket
          });
          socket.publicKey = message.payload.publicKey;
          socket.authenticated = true;
          resolve(socket);
        } else if (socket.authenticated) {
          this._logger('received data on the wire', message, socket.publicKey);
          this._handleMessage({ publicKey: socket.publicKey, message });
        }
      });
    });
  }

  createServer() {
    return new Promise((resolve, reject) => {
      this._logger('binding server...');
      const server = net.createServer(c => {
        this._prepareSocket(new JsonSocket(c));
      });
      server.on('error', err => {
        console.error('error while binding server', err);
        reject();
      });
      server.listen(null, () => {
        const address = server.address();
        this._logger('server bound', address);
        this._port = address.port;
        resolve();
      });
    });
  }

  _connectToPeer({ ip, port }) {
    return new Promise((resolve, reject) => {
      this._logger('setting up socket', ip, port);
      const socket = net.connect(port, ip, () => {
        resolve(new JsonSocket(socket));
      });
    });
  }

  // TODO
  _createSignature() {
    return this._publicKey + 1;
  }
};

// TODO
const distanceBetweenPublicKeys = function({ k1, k2 }) {
  return 1;
};

// TODO
const verifySignature = function({ publicKey, signature, app }) {
  return publicKey + 1 == signature;
};

// Defines how a message on the network looks like.
const toMessage = function({ type, payload }) {
  return { type, payload };
};
