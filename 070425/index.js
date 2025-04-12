const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const onoff = require('onoff');
const i2cbus = require('i2c-bus');
//const sendTemp = require('./iothub.js');

const { Client, Message } = require('azure-iot-device');
const { Mqtt } = require('azure-iot-device-mqtt'); // Importeer de Mqtt module
const Protocol = require('azure-iot-device-mqtt').Mqtt; // Alias geven aan Mqtt als Protocol
const { connectionString } = require('./settings.js');

var output22 = new onoff.Gpio(22+512, 'out');
var output17 = new onoff.Gpio(17+512, 'out');
var input16 = new onoff.Gpio(16+512, 'in', 'both');
var input18 = new onoff.Gpio(18+512, 'in', 'both');

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/script.js');
});

// iothub.js code start:
// create a client
let client = Client.fromConnectionString(connectionString, Protocol);

// open client
client.open()
    .then((connected) => console.log(`IOTHUB connected: ${JSON.stringify(connected)}`))
    .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));

// Twin set initial desired alarmtemp and set reported alarm to false when alarmtemp changes
client.getTwin()
  .then((twin) => {
    /*
    twin.properties.desired.update({ alarmtemp: 21 }, error => {
       if (error) {
          console.log(`error updating twin desired properties: ${JSON.stringify(error)}`);
       } else {
          console.log(`twin desired properties updated: ${JSON.stringify({ alarmtemp: twin.properties.desired.alarmtemp })}`);
       }
    });
    */
    twin.on('properties.desired.alarmtemp', (desiredChange) => {
       console.log('in twin on');
       io.emit('twin property alarmtemp', `${JSON.stringify(desiredChange)}`);
       if ((twin.properties.reported && !('alarmtempcopy' in twin.properties.reported)) || twin.properties.reported.alarmtempcopy != twin.properties.desired.alarmtemp) { // echt nieuwe desired of door inladen?
         console.log(`received new desired properties: ${JSON.stringify(desiredChange)}`);
         twin.properties.reported.update({ alarm: false, alarmtempcopy: twin.properties.desired.alarmtemp }, (error) => {
           if (error) {
              console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
           } else {
              console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              io.emit('twin property alarm', twin.properties.reported.alarm);
           }
         });
       }
       else
         io.emit('twin property alarm', twin.properties.reported.alarm);
    });
  })
  .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));

// Telemetry message after new temp
let messageId = 0;
function sendTemp(temp) {
    let messageData = {
      messageId: messageId++,
      deviceId: 'Raspberry Pi',
      temperature: temp
    };
    client.sendEvent(new Message(JSON.stringify({...messageData})))
      .then((connected) => console.log(`IOTHUB connected: ${JSON.stringify(connected)}`))
      .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));
}

// alarm direct method
client.onDeviceMethod('alarm', () => {
   console.log("ALARM");
});

// Twin update alarm after new temp
function updateTwinAfterTemp(temp) {
   client.getTwin()
      .then((twin) => {
        var alarmflag = false;
        if (temp >= parseInt(twin.properties.desired.alarmtemp))
           alarmflag = true;
        twin.properties.reported.update({ alarm: alarmflag }, (error) => {
           if (error) {
              console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
           } else {
              console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              //io.emit('twin property alarmtemp', twin.properties.desired.alarmtemp);
              io.emit('twin property alarm', twin.properties.reported.alarm);
           }
        });
        /*
        if (temp >= parseInt(twin.properties.desired.alarmtemp)) {
           twin.properties.reported.update({ alarm: true }, (error) => {
              if (error) {
                 console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
              } else {
                 console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              }
           });
        } else {
           twin.properties.reported.update({ alarm: false }, (error) => {
              if (error) {
                 console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
              } else {
                 console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              }
           });
        }
        */
      })
      .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));
}
// iothub.js code stop

io.on('connection', (socket) => {
  console.log('a user connected');
  client.getTwin(); // 'client.' code wordt telkens opnieuw overlopen/ingeladen, ook van Azure (daarom wordt twin.on telkens getriggerd). Hier gedaan zodat properties ook verschijnen op webpagina van nieuwe socket.
  socket.on('disconnect', () => {
   console.log('user disconnected');
  });
});

io.on('connection', (socket) => {
  socket.on('temp', (msg) => {
    i2cbus.openPromisified(1).
      then(i2c1  => i2c1.readByte(0x48, 0x00).
        then(temperature => {
          io.emit('temp', temperature);
          sendTemp(temperature);
          updateTwinAfterTemp(temperature); // 'client.' code wordt telkens opnieuw overlopen/ingeladen, ook van Azure (daarom wordt twin.on telkens getriggerd).
        }).
        then(_ => i2c1.close())
      ).catch(console.log);
  });
  socket.on('chat message', (msg) => {
    if (msg == "get gpio 16") {
      var state16 = input16.readSync();
      io_emit(msg, state16);
    }
    else if (msg == "get gpio 18") {
      var state18 = input18.readSync();
      io_emit(msg, state18);
    }
    else if (msg == "set gpio 22 to 1") {
      output22.writeSync(1);
      io_emit(msg, 'GPIO 22 SET TO 1');
    }
    else if (msg == "set gpio 22 to 0") {
      output22.writeSync(0);
      io_emit(msg, 'GPIO 22 SET TO 0');
    }
    else if (msg == "set gpio 17 to 1") {
      output17.writeSync(1);
      io_emit(msg, 'GPIO 17 SET TO 1');
    }
    else if (msg == "set gpio 17 to 0") {
      output17.writeSync(0);
      io_emit(msg, 'GPIO 17 SET TO 0');
    }
    else {
      io.emit('chat message', msg);
    }
  });
});

function io_emit(ques, ans) {
  io.emit('chat message gpio ques', ques);
  io.emit('chat message gpio ans', ans);
}

/*
function io_emit_twin_properties(alarmtemp, alarm) {
  io.emit('twin property alarmtemp', alarmtemp);
  io.emit('twin property alarm', alarm);
}
*/

server.listen(3000, () => {
  console.log('listening on *:3000');
});
