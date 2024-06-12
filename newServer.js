const { WebSocketServer } = require("ws");
const http = require("http");

const SERVER_PORT = 4444;
const webSocketServer = new WebSocketServer({ noServer: true });

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("okay");
});

const topicSubscriptions = new Map();
const sendMessage = (connection, message) => {
  if (
    connection.readyState !== 0 &&
    connection.readyState !== 1
  ) {
    connection.close();
  }
  try {
    connection.send(JSON.stringify(message));
  } catch (error) {
    connection.close();
  }
};
const handleConnection = (connection) => {
  const subscribedTopics = new Set();
  let isClosed = false;
  let pongReceived = true;

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      connection.close();
      clearInterval(pingInterval);
    } else {
      pongReceived = false;
      try {
        connection.ping();
      } catch (error) {
        connection.close();
      }
    }
  }, 30000);

  connection.on("pong", () => {
    pongReceived = true;
  });

  connection.on("close", () => {
    subscribedTopics.forEach((topic) => {
      const subscribers = topicSubscriptions.get(topic) || new Set();
      subscribers.delete(connection);
      if (subscribers.size === 0) {
        topicSubscriptions.delete(topic);
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
              let subscribers;
              if (!topicSubscriptions.has(topic)) {
                subscribers = new Set();
                topicSubscriptions.set(topic, subscribers);
              } else {
                subscribers = topicSubscriptions.get(topic);
              }
              subscribers.add(connection);
              subscribedTopics.add(topic);
              console.log(topicSubscriptions);
              // console.log(subscribedTopics);
            }
          });
          break;
        case "unsubscribe":
          (msg.topics || []).forEach((topic) => {
            const subscribers = topicSubscriptions.get(topic);
            if (subscribers) {
              subscribers.delete(connection);
            }
          });
          break;
        case "publish":
          if (msg.topic) {
            const receivers = topicSubscriptions.get(msg.topic);
            if (receivers) {
              msg.clients = receivers.size;
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

httpServer.on("upgrade", (req, socket, head) => {
  const handleAuth = (ws) => {
    webSocketServer.emit("connection", ws, req);
  };
  webSocketServer.handleUpgrade(req, socket, head, handleAuth);
});

httpServer.listen(SERVER_PORT, () => {
  console.log(`Signaling server running on http://localhost:${SERVER_PORT}`);
});
