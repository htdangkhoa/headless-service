import type { WebSocket } from 'ws';

export class ClientManagement {
  private clients: Map<string, WebSocket> = new Map();

  constructor() {
    this.clients = new Map();
  }

  addClient(client: WebSocket) {
    if (!client.id) {
      throw new Error('Client ID is required');
    }

    this.clients.set(client.id, client);
  }

  removeClient(client: WebSocket) {
    if (!client.id) {
      throw new Error('Client ID is required');
    }

    this.clients.delete(client.id);
  }

  getClient(id: string) {
    return this.clients.get(id);
  }

  getClients() {
    return Array.from(this.clients.values());
  }

  broadcast(data: string | Buffer) {
    this.clients.forEach((client) => {
      client.send(data);
    });
  }

  send(id: string, data: string | Buffer) {
    const client = this.clients.get(id);

    if (!client) {
      throw new Error('Client not found');
    }

    client.send(data);
  }

  clear() {
    this.getClients().forEach((client) => {
      client.close();
    });

    this.clients.clear();
  }
}
