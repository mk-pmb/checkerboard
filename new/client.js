(function(globals) {
  "use strict";

  globals.cb2 = {
    connect: function(ws, callback) {
      return new Connection(ws, callback);
    }
  };

  function Connection(ws, callback) {
    for (var p in Connection.defaults)
      this[p] = Connection.defaults[p];

    this.sendSeqToTimeoutId = {};
    this.sendSeq = 0;

    this.receiveQueue = [];
    this.receiveSeq = 0;

    this.transactionQueue = {};
    this.transactionSeq = 0;

    this.store = {};
    this.observers = [];

    this.ws = new WebSocket(ws);
    this.ws.addEventListener("message", this.receive.bind(this));
    this.ws.addEventListener("open", callback.bind(this));
  }

  Connection.defaults = {
    timeout: 1000
  };

  Connection.prototype.sync = function(id) {
    this.storeId = id;
    this.send("sync", id);
  };

  Connection.prototype.addObserver = function(observer) {
    this.observers.push(observer);
  };

  Connection.prototype.removeObserver = function(observer) {
    this.observers.splice(this.observers.indexOf(observer), 1);
  };

  Connection.prototype.transaction = function(paths, action, seq) {
    seq = (typeof seq !== "undefined" ? seq : this.transactionSeq++);

    paths = paths.map((function(path) {
      if (typeof path === "string" || path instanceof String)
        return path.split(".");

      return path;
    }).bind(this));

    var dependencies = paths.map((function(path) {
      return getByPath(this.store, path);
    }).bind(this));

    action.apply(null, dependencies);

    var versions = {};
    var updates = {};
    for (var i = 0; i < paths.length; i++) {
      var version = dependencies[i]._id || 0;
      versions[paths[i].join(".")] = version;
      dependencies[i]._id = version + 1;
      updates[paths[i].join(".")] = dependencies[i];
    }

    this.transactionQueue[seq] = {paths: paths, action: action};

    this.send("transaction", {
      seq: seq,
      storeId: this.storeId,
      versions: versions,
      updates: updates
    });

    this.observers.forEach((function(observer) {
      observer(this.store);
    }).bind(this));
  };

  function getByPath(obj, path) {
    if (path.length === 0)
      return obj;

    if (!(path[0] in obj))
      obj[path[0]] = {};

    var next = obj[path[0]];

    return getByPath(next, path.slice(1));
  }

  // Sending and receiving logic.
  Connection.prototype.send = function(channel, message, seq) {
    seq = (typeof seq !== "undefined" ? seq : this.sendSeq++);

    this.ws.send(JSON.stringify(new Envelope(channel, message, seq)));
    this.sendSeqToTimeoutId[seq] = setTimeout((function() {
      this.send(channel, message, seq);
    }).bind(this), this.timeout);
  };

  Connection.prototype.receive = function(e) {
    var envelope = Object.assign(new Envelope(), JSON.parse(e.data));

    if (envelope.channel === "ack") {
      clearTimeout(this.sendSeqToTimeoutId[envelope.seq]);
      delete this.sendSeqToTimeoutId[envelope.seq];
    } else if (envelope.seq >= this.receiveSeq) {
      this.ws.send(JSON.stringify(new Ack(envelope.seq)));

      this.receiveQueue.push(envelope);
      this.receiveQueue.sort(function(a, b) {
        return a.seq - b.seq;
      });

      while (this.receiveQueue.length > 0 && this.receiveSeq === this.receiveQueue[0].seq) {
        this.receiveSeq++;
        this.processReceive(this.receiveQueue.shift());
      }
    }
  };

  Connection.prototype.processReceive = function(envelope) {
    var channel = envelope.channel,
        message = envelope.message;

    var p, path;
    switch(channel) {
      case "set-store":
        if (message.storeId !== this.storeId)
          break;

        this.store = message.store;

        this.observers.forEach((function(observer) {
          observer(this.store);
        }).bind(this));

        break;
      case "updates":
        if (message.storeId !== this.storeId)
          break;

        for (p in message.updates) {
          path = p.split(".");
          getByPath(this.store, path.slice(0, -1))[path.pop()] = message.updates[p];
        }

        this.observers.forEach((function(observer) {
          observer(this.store);
        }).bind(this));

        break;
      case "transaction-success":
        delete this.transactionQueue[message.seq];
        break;
      case "transaction-failure":
        var transaction = this.transactionQueue[message.seq];
        delete this.transactionQueue[message.seq];
        this.transaction(transaction.paths, transaction.action, message.seq);
        break;
    }
  };

  // Helpers.
  function Envelope(channel, message, seq) {
    this.channel = channel;
    this.message = message;
    this.seq = seq;
  }

  function Ack(seq) {
    this.channel = "ack";
    this.seq = seq;
  }
}((1, eval)("this")));