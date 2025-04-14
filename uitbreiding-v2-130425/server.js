const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static("public"));

const EventHubReader = require("./event-hub-reader.js");
const { eventHubConsumerGroup, eventHubConnectionString } = require("./settings.js");

console.log(`Using event hub consumer group [${eventHubConsumerGroup}]`);
console.log(`Using EventHub connection string [${eventHubConnectionString}]`);

const { MongoClient } = require("mongodb");
const uri = "***REMOVED***";
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
      var findQuery = msg;
      var total_arr = [];
      var temp_arr = [];
      var date_arr = [];
      try {
        const cursor = await collection.find(findQuery).sort({ Date: 1 });
        await cursor.forEach(temp_log => {
          temp_arr.push(temp_log.Temperature);
          date_arr.push(temp_log.Date);
        });
        total_arr.push(temp_arr);
        total_arr.push(date_arr);
        socket.emit('get data', total_arr);
      } catch (err) {
        console.error(`Something went wrong: ${err}\n`);
      }
    });
  });

  await eventHubReader.startReadMessage(async (message, date, deviceId) => {
    try {
      const payload = {
        Temperature: message.temperature,
        Date: date || Date.now().toISOString(),
        Device: deviceId + ' - ' + message.deviceId
      };

      //io.emit('msg', payload);
      await collection.insertOne(payload);
    } catch (err) {
      console.error("Error: [%s] from [%s].", err, message);
    }
  });

 // await client.close();
})().catch();
