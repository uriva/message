# Applications

* Each node is run within an application.
* It independent and unaware of any other stuff going on in the device.
* It does carry the public key of the user which is shared across different apps,

# Application specific private key, or "secondary key"

The secondary key passed into the node is not the private key of the public key passed into it. Rather it is a secondary key. once-removed from it. This secondary key can produce tokens that prove that the secondary key was produced using the original private key with full knowledge of the app and expiration, and the token is within the expiration limit.

When a user which owns a private key prdouces a secondary key, they essentially say "I grant the carrier of this token permission to act as me **within the app ID** for this **period of time**". This makes **app ID** more like a protocol ID than a real app.

Note that this authentication cannot be revoked, as so in theory a malicious app can act on your behalf for the allotted time, and you won't be able to stop it.
