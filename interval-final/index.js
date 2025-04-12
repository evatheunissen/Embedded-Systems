const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const onoff = require('onoff');
const i2cbus = require('i2c-bus');
// voorbeeld van functie inladen uit aparte file (momenteel zijn iothub-functionaliteiten hier ingebouwd)
// const sendTemp = require('./iothub.js');

const { Client, Message } = require('azure-iot-device');
const { Mqtt } = require('azure-iot-device-mqtt');
const Protocol = require('azure-iot-device-mqtt').Mqtt;
const { connectionString } = require('./settings.js');

// gpio's
var output22 = new onoff.Gpio(22+512, 'out');
var output17 = new onoff.Gpio(17+512, 'out');
var input16 = new onoff.Gpio(16+512, 'in', 'both');
var input18 = new onoff.Gpio(18+512, 'in', 'both');

// load files in public
app.use(express.static('public'));

// measure temperature (sensor) every 10 seconds -> call functions 
setInterval(async () => {
  try {
    let i2c1 = await i2cbus.openPromisified(1);
    let temperature = await i2c1.readByte(0x48, 0x00);
    console.log(temperature);
    io.emit('temp', temperature);
    sendTemp(temperature);
    updateTwinAfterTemp(temperature);
    await i2c1.close();
  }
  catch(error) {
    console.log(error);
  }
}, 10000);

// iothub.js code start:
// create a client
const client = Client.fromConnectionString(connectionString, Protocol);

// open client
client.open()
    .then((connected) => console.log(`IOTHUB connected: ${JSON.stringify(connected)}`))
    .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));

// twin get
var twinSaved;

client.getTwin()
  .then((twin) => {
    twinSaved = twin;
    /* werkt niet, desired property manueel aanpassen in azure
    twin.properties.desired.update({ alarmtemp: 21 }, error => {
       if (error) {
          console.log(`error updating twin desired properties: ${JSON.stringify(error)}`);
       } else {
          console.log(`twin desired properties updated: ${JSON.stringify({ alarmtemp: twin.properties.desired.alarmtemp })}`);
       }
    });
    */
    /* twin.on met aanmaak van reported property alarmtempcopy -> om distinctie te maken tussen (eerste keer server run en azure connectie (alarmtempcopy nog niet aangemaakt) OF effectieve change van alarmtemp) én (else: herstart server)
    twin.on('properties.desired.alarmtemp', (desiredChange) => {
       console.log('in twin on');
       io.emit('twin property alarmtemp', `${JSON.stringify(desiredChange)}`);
       if ((twin.properties.reported && !('alarmtempcopy' in twin.properties.reported)) || twin.properties.reported.alarmtempcopy != twin.properties.desired.alarmtemp) {
         console.log(`received new desired properties: ${JSON.stringify(desiredChange)}`);
         twin.properties.reported.update({ alarm: false, alarmtempcopy: twin.properties.desired.alarmtemp }, (error) => {
           if (error) {
              console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
           } else {
              console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              io.emit('twin property alarm', twin.properties.reported.alarm + ' (not yet checked/calculated)');
           }
         });
       }
       else
         io.emit('twin property alarm', twin.properties.reported.alarm + ' (last time server ran)');
    });
    */
    // wanneer alarmtemp aangepast wordt, sturen we dat door naar client voor publicatie op website en zetten we alarm op false (twin update) en sturen we dat ook naar client
    twin.on('properties.desired.alarmtemp', (desiredChange) => {
       console.log(`received new desired properties: ${JSON.stringify(desiredChange)}`);
       io.emit('twin property alarmtemp', `${JSON.stringify(desiredChange)}`);
       twin.properties.reported.update({ alarm: false }, (error) => {
          if (error) {
             console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
          } else {
             console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
             io.emit('twin property alarm', twin.properties.reported.alarm);
          }
       });
    });
  })
  .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));

// telemetry message after new temp
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

// alarm reset: direct method (probeer manueel in Azure IoT Explorer)
client.onDeviceMethod('alarmreset', () => {
   console.log("ALARMRESET");
   if (twinSaved != undefined) {
      twinSaved.properties.reported.update({ alarm: false }, (error) => {
         if (error) {
            console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
         } else {
            console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twinSaved.properties.reported.alarm })}`);
            io.emit('twin property alarm', twinSaved.properties.reported.alarm);
         }
      });
   }
});

// Twin update alarm after new temp
function updateTwinAfterTemp(temp) {
   var alarmflag = false;
   if (temp >= parseInt(twinSaved.properties.desired.alarmtemp))
      alarmflag = true;
   twinSaved.properties.reported.update({ alarm: alarmflag }, (error) => {
      if (error) {
         console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
      } else {
         console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twinSaved.properties.reported.alarm })}`);
         // alarmtemp werd hier niet aangepast maar sturen we toch door naar clients zodat nieuw geconnecteerde clients die ook tonen (want werd enkel bij opstart server of verandering naar clients gestuurd, terwijl alarm om de 10 sec aangepast en dus vanzelfsprekend naar clients gestuurd wordt)
         io.emit('twin property alarmtemp', twinSaved.properties.desired.alarmtemp);
         io.emit('twin property alarm', twinSaved.properties.reported.alarm);
      }
   });
}
// iothub.js code stop

// socket.io
// connect & disconnect
io.on('connection', (socket) => {
  console.log('a user connected');
  socket.on('disconnect', () => {
   console.log('user disconnected');
  });
});

// listen to 'chat message' and check msg -> gpio get & set
io.on('connection', (socket) => {
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

// server listen
server.listen(3000, () => {
  console.log('listening on *:3000');
});
