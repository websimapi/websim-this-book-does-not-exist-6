class WebsimSocket {
  constructor() {
    this.socket = new WebSocket('wss://multiplayer.websim.ai');
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.collections = {};
    this.party = {
      client: { id: null, username: null },
      peers: {},
      subscribe: (callback) => {
        this.partyCallbacks.push(callback);
        return () => {
          this.partyCallbacks = this.partyCallbacks.filter(cb => cb !== callback);
        };
      }
    };
    this.partyCallbacks = [];

    this.socket.onopen = (event) => {
      console.log('Connected to WebsimSocket');
      if (this.onopen) this.onopen(event);
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        this.party.client.id = data.clientId;
        this.party.client.username = data.username;
        this.party.peers[data.clientId] = { id: data.clientId, username: data.username };
        this.notifyPartySubscribers();
      } else if (data.type === 'disconnected') {
        delete this.party.peers[data.clientId];
        this.notifyPartySubscribers();
      }

      if (this.onmessage) this.onmessage({ data });
    };

    this.socket.onclose = (event) => {
      console.log('Disconnected from WebsimSocket');
      if (this.onclose) this.onclose(event);
    };

    this.socket.onerror = (error) => {
      console.error('WebsimSocket error:', error);
      if (this.onerror) this.onerror(error);
    };
  }

  send(data) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.error('Socket is not open');
    }
  }

  notifyPartySubscribers() {
    for (const callback of this.partyCallbacks) {
      callback(this.party.peers);
    }
  }

  collection(type) {
    if (!this.collections[type]) {
      this.collections[type] = new Collection(type, this);
    }
    return this.collections[type];
  }
}

class Collection {
  constructor(type, socket) {
    this.type = type;
    this.socket = socket;
    this.records = [];
    this.subscribers = [];
    this.filterFn = null;

    // Set up message handler for records
    const originalOnmessage = this.socket.onmessage;
    this.socket.onmessage = (event) => {
      const data = event.data;
      if (data.recordType === this.type) {
        if (data.action === 'create' || data.action === 'update') {
          const index = this.records.findIndex(r => r.id === data.record.id);
          if (index >= 0) {
            this.records[index] = data.record;
          } else {
            this.records.push(data.record);
          }
          this.notifySubscribers();
        } else if (data.action === 'delete') {
          this.records = this.records.filter(r => r.id !== data.id);
          this.notifySubscribers();
        }
      }
      
      if (originalOnmessage) originalOnmessage(event);
    };

    // Initial fetch
    this.fetchRecords();
  }

  async fetchRecords() {
    try {
      const response = await fetch(`https://api.websim.ai/collection/${this.type}`);
      if (response.ok) {
        this.records = await response.json();
        this.notifySubscribers();
      }
    } catch (error) {
      console.error(`Error fetching ${this.type} records:`, error);
    }
  }

  async create(data) {
    try {
      const record = {
        ...data,
        type: this.type,
        username: this.socket.party.client.username,
        created_at: new Date().toISOString()
      };
      
      const response = await fetch(`https://api.websim.ai/collection/${this.type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      
      if (response.ok) {
        const createdRecord = await response.json();
        this.records.push(createdRecord);
        this.notifySubscribers();
        return createdRecord;
      }
    } catch (error) {
      console.error(`Error creating ${this.type} record:`, error);
      throw error;
    }
  }

  async update(id, data) {
    try {
      const record = this.records.find(r => r.id === id);
      if (!record || record.username !== this.socket.party.client.username) {
        throw new Error('Cannot update record: not found or not yours');
      }
      
      const updatedRecord = { ...record, ...data };
      
      const response = await fetch(`https://api.websim.ai/collection/${this.type}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord)
      });
      
      if (response.ok) {
        const returnedRecord = await response.json();
        const index = this.records.findIndex(r => r.id === id);
        this.records[index] = returnedRecord;
        this.notifySubscribers();
        return returnedRecord;
      }
    } catch (error) {
      console.error(`Error updating ${this.type} record:`, error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const record = this.records.find(r => r.id === id);
      if (!record || record.username !== this.socket.party.client.username) {
        throw new Error('Cannot delete record: not found or not yours');
      }
      
      const response = await fetch(`https://api.websim.ai/collection/${this.type}/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        this.records = this.records.filter(r => r.id !== id);
        this.notifySubscribers();
        return true;
      }
    } catch (error) {
      console.error(`Error deleting ${this.type} record:`, error);
      throw error;
    }
  }

  filter(criteria) {
    const filteredCollection = new Collection(this.type, this.socket);
    filteredCollection.filterFn = (record) => {
      for (const key in criteria) {
        if (record[key] !== criteria[key]) {
          return false;
        }
      }
      return true;
    };
    return filteredCollection;
  }

  getList() {
    if (this.filterFn) {
      return this.records.filter(this.filterFn);
    }
    return this.records;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this.getList());
    
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  notifySubscribers() {
    for (const callback of this.subscribers) {
      callback(this.getList());
    }
  }
}

