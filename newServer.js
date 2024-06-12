const { WebSocketServer } = require("ws");
const http = require("http");
const libMap = require("lib0/map");

const CONNECTION_STATE_CONNECTING = 0;
const CONNECTION_STATE_OPEN = 1;

const RECEIVED_PING_INTERVAL = 30000;

const PORT = 4444;
const webSocketServer = new WebSocketServer({ noServer: true });

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("okay");
});
const topicSubscribers = new Map();
const sendMessage = (connection, message) => {
  if (
    connection.readyState !== CONNECTION_STATE_CONNECTING &&
    connection.readyState !== CONNECTION_STATE_OPEN
  ) {
    connection.close();
  }
  try {
    connection.send(JSON.stringify(message));
  } catch (err) {
    connection.close();
  }
};
const handleConnection = (connection) => {
  const subscribedTopics = new Set();
  let isClosed = false;
  let pongReceived = true;
  const pingCheckInterval = setInterval(() => {
    if (!pongReceived) {
      connection.close();
      clearInterval(pingCheckInterval);
    } else {
      pongReceived = false;
      try {
        connection.ping();
      } catch (err) {
        connection.close();
      }
    }
  }, RECEIVED_PING_INTERVAL);
  connection.on("pong", () => {
    pongReceived = true;
  });

  connection.on("close", () => {
    subscribedTopics.forEach((topic) => {
      const subscribers = topicSubscribers.get(topic) || new Set();
      subscribers.delete(connection);
      if (subscribers.size === 0) {
        topicSubscribers.delete(topic);
      }
    });
    subscribedTopics.clear();
    isClosed = true;
  });

  connection.on("message", (msg) => {
    if (typeof msg === "string" || msg instanceof Buffer) {
      msg = JSON.parse(msg);
    }
    if (msg && msg.type && !isClosed) {
      switch (msg.type) {
        case "subscribe":
          (msg.topics || []).forEach((topic) => {
            if (typeof topic === "string") {
              const subscribers = libMap.setIfUndefined(
                topicSubscribers,
                topic,
                () => new Set()
              );
              subscribers.add(connection);
              subscribedTopics.add(topic);
            }
          });
          break;
        case "unsubscribe":
          (msg.topics || []).forEach((topic) => {
            const subscribers = topicSubscribers.get(topic);
            if (subscribers) {
              subscribers.delete(connection);
            }
          });
          break;
        case "publish":
          if (msg.topic) {
            const receivers = topicSubscribers.get(msg.topic);
            if (receivers) {
              msg.clients = receivers.size;
              console.log("Publishing message:", msg);
              receivers.forEach((receiver) => sendMessage(receiver, msg));
            }
          }
          break;
        case "ping":
          sendMessage(connection, { type: "pong" });
      }
    }
  });
};

webSocketServer.on("connection", handleConnection);

httpServer.listen(PORT, () => {
  console.log(`Websocket server runs on http://localhost:${PORT}`);
});
