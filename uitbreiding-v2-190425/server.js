const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static("public"));

const EventHubReader = require("./event-hub-reader.js");
const { eventHubConsumerGroup, eventHubConnectionString, uri } = require("./settings.js");

console.log(`Using event hub consumer group [${eventHubConsumerGroup}]`);
console.log(`Using EventHub connection string [${eventHubConnectionString}]`);

const { MongoClient } = require("mongodb");
const client = new MongoClient(uri);
const dbName = "tempDatabase";
const collectionName = "tempLogs";

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

server.listen(5000, () => {
  console.log("Listening on %d.", server.address().port);
});

const eventHubReader = new EventHubReader(eventHubConsumerGroup, eventHubConnectionString);

(async () => {
  await client.connect();
  const database = client.db(dbName);
  const collection = database.collection(collectionName);

  io.on("connection", (socket) => {
    socket.on('get devices', async (msg) => {
      try {
        var devices = await collection.distinct("Device");
        socket.emit('get devices', devices);
      } catch (err) {
        console.error("Error");
      }
    });
    socket.on('get data', async (msg) => {
      var query = msg;
      if (query.Date) {
         if (query.Date.$gte) query.Date.$gte = new Date(query.Date.$gte);
         if (query.Date.$lte) query.Date.$lte = new Date(query.Date.$lte);
      }
      console.log(msg);
      try {
        const cursor = await collection.find(query).sort({ Date: 1 });
        const results = await cursor.toArray();
        socket.emit('get data', results);
      } catch (err) {
        console.error(`Something went wrong: ${err}\n`);
      }
    });
  });

  await eventHubReader.startReadMessage(async (message, date, deviceId) => {
    try {
      const payload = {
        Temperature: message.temperature,
        Date: date,
        Device: deviceId + ' - ' + message.deviceId
      };
      await collection.insertOne(payload);
    } catch (err) {
      console.error("Error: [%s] from [%s].", err, message);
    }
  });
})().catch();
