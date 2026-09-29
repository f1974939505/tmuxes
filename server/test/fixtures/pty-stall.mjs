let stall = false;
process.on('message', msg => {
  if (msg.type === 'spawn') stall = msg.options.env?.STALL === '1';
  if (msg.type === 'resize' && stall) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  if (msg.type === 'write') process.send({ type: 'data', data: msg.data });
  if (msg.type === 'kill') process.exit(0);
  process.send({ type: 'ack', id: msg.id });
});
