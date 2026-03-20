const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead = [];
  for (const client of clients) {
    try {
      if (client.writableEnded || client.destroyed) {
        dead.push(client);
        continue;
      }
      client.write(payload);
    } catch {
      dead.push(client);
    }
  }
  for (const c of dead) clients.delete(c);
}

export function clientCount() {
  return clients.size;
}
