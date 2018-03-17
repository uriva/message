// Defines how a message on the network looks like.
exports.toMessage = function({ type, payload }) {
  return JSON.stringify({ type, payload });
};
