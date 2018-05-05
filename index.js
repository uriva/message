const net = require('net');
const JsonSocket = require('json-socket');
const Timeout = require('await-timeout');
const ngrok = require('ngrok');
const constants = {
  IDENTIFY: 'IDENTIFY',
  SEARCH_PEER: 'SEARCH_PEER'
};

exports.makeNode = async function(args) {
  const node = new Node(args);
  await node.createServer();
  return node;
};

const Node = class {
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
      const searchedKey = message.payload.searchedKey;
      this._logger('got search peer request', searchedKey);
      const physicalAddress = message.payload.physicalAddress;
      if (searchedKey == this._publicKey) {
        this._logger('peer wants my physical address');
        this._createVerifiedSocket({
          physicalAddress
        });
      } else {
        this._sendSearchRequest({
          publicKey: searchedKey,
          physicalAddress
        });
      }
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
      this._sendSearchRequest({
        publicKey: recipient,
        // TODO: would have been good to encrypt this, but can't decrypt with secondary key.
        physicalAddress: { ip: this._publicIp, port: this._publicPort }
      });
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
        physicalAddress: this._publicKeyToPhysicalAddress[recipient]
      });
    } catch (e) {
      delete this._publicKeyToPhysicalAddress[recipient];
      return Promise.reject(
        'Could not create verified socket, removed physical address.'
      );
    }
  }

  async _createVerifiedSocket({ physicalAddress }) {
    this._logger('creating verified socket', physicalAddress);
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
  _sendSearchRequest({ publicKey, physicalAddress }) {
    const peers = [
      this._publicKey,
      ...Object.keys(this._publicKeyToPhysicalAddress)
    ];
    const distances = peers.map(
      distanceBetweenPublicKeys.bind(null, publicKey)
    );
    const minPeer = peers[distances.indexOf(Math.min(...distances))];
    if (minPeer == this._publicKey) {
      console.error(
        `closest peer is self (${
          this._publicKey
        }) so no peers to query about physical address of ${publicKey}.`
      );
      return;
    }
    try {
      this.sendMessage(
        {
          recipient: minPeer,
          type: constants.SEARCH_PEER,
          payload: {
            searchedKey: publicKey,
            physicalAddress
          }
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
          // this._logger('got initial data on socket', message);
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
          // this._logger('received data on the wire', message, socket.publicKey);
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
      server.listen(null, async () => {
        const address = server.address();
        this._logger('server bound', address);
        try {
          await ngrok.authtoken('3ApnVFTaFGJg12z6BgJqk_24gVyKQRaeaXzd64R9duY');
          const url = await ngrok.connect({ proto: 'tcp', addr: address.port });
          console.log(url);
          this._logger(`public tunnel url: ${url}`);
          const parts = url.split(':');
          this._publicIp = parts[1].slice(2);
          this._publicPort = parts[2];
          resolve();
        } catch (e) {
          console.error(e);
          reject();
        }
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
    return 'sigfor' + this._publicKey;
  }
};

const distanceBetweenPublicKeys = function(k1, k2) {
  let delta = 0;
  for (i = 0; i < k1.length; i++) {
    if (k1[i] != k2[i]) {
      delta += 1;
    }
  }
  return delta;
};

// TODO
const verifySignature = function({ publicKey, signature, app }) {
  return true;
};

// Defines how a message on the network looks like.
const toMessage = function({ type, payload }) {
  return { type, payload };
};
