# Overcom

P2P JSON passing using DHT that maps public key and app ID to physical address (IP+port).

## Applications

* The library lets the caller create a node. An application running on a user's device will usually have one node.
* The app and node in it are independent and unaware of any other stuff going on in the device.
* The node carries the public key of the user which is shared across different apps,

## Application specific private key, or "secondary key"

The secondary key passed into the node is not the private key of the public key passed into it. Rather it is a secondary key. once-removed from it. This secondary key can produce tokens that prove that the secondary key was produced using the original private key with full knowledge of the app and expiration, and the token is within the expiration limit.

When a user which owns a private key prdouces a secondary key, they essentially say "I grant the carrier of this token permission to act as me **within the app ID** for this **period of time**". This makes **app ID** more like a protocol ID than a real app.

Note that this authentication cannot be revoked, as so in theory a malicious app can act on your behalf for the allotted time, and you won't be able to stop it.

## Example

Alice binding server...

Alice server bound { address: '::', family: 'IPv6', port: 43769 }

Bob binding server...

Bob server bound { address: '::', family: 'IPv6', port: 46559 }

Eve binding server...

Eve server bound { address: '::', family: 'IPv6', port: 37429 }

Bob getting socket 000

Bob current physical addresses { '000': { ip: 'localhost', port: 43769 } }

Bob creating verified socket { ip: 'localhost', port: 43769 }

Bob setting up socket localhost 43769

Alice handling new socket

Alice sending own credentials

Alice waiting for credentials

Bob handling new socket

Bob sending own credentials

Bob waiting for credentials

Bob verified signature

Bob registering socket 000

sent message

Eve getting socket 001

Eve current physical addresses { '000': { ip: 'localhost', port: 43769 } }

Eve getting socket 000

Eve current physical addresses { '000': { ip: 'localhost', port: 43769 } }

Eve creating verified socket { ip: 'localhost', port: 43769 }

Eve setting up socket localhost 43769

Alice verified signature

Alice registering socket 001

alice got message [ { publicKey: '001', message: { type: 'bla', payload: 'hello Alice' } } ]
    
Alice handling new socket

Alice sending own credentials

Alice waiting for credentials

Eve handling new socket

Eve sending own credentials

Eve waiting for credentials

Eve verified signature

Eve registering socket 000

Alice verified signature

Alice registering socket 111

Alice got search peer request 001

Alice getting socket 001

Bob got search peer request 001

Bob peer wants my physical address

Bob creating verified socket { ip: '::', port: 37429 }

Bob setting up socket :: 37429

Eve handling new socket

Eve sending own credentials

Eve waiting for credentials

Bob handling new socket

Bob sending own credentials

Bob waiting for credentials

Bob verified signature

Bob registering socket 111

Eve verified signature

Eve registering socket 001

Eve getting socket 001

sent message

bob got message [ { publicKey: '111', message: { type: 'bla', payload: 'hello Bob I got your IP from Alice' } } ]
