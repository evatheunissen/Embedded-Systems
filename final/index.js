const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const onoff = require('onoff');
const i2cbus = require('i2c-bus');

const { Client, Message } = require('azure-iot-device');
const Protocol = require('azure-iot-device-mqtt').Mqtt;
const { connectionString } = require('./settings.js');

// gpio's
var output22 = new onoff.Gpio(22+512, 'out');
var output17 = new onoff.Gpio(17+512, 'out');
var input16 = new onoff.Gpio(16+512, 'in', 'both');
var input18 = new onoff.Gpio(18+512, 'in', 'both');

// load files in public
app.use(express.static('public'));

// iothub.js code start:
// create a client
const client = Client.fromConnectionString(connectionString, Protocol);

// open client
client.open()
    .then((connected) => console.log(`IOTHUB connected: ${JSON.stringify(connected)}`))
    .catch((error) => console.log(`IOTHUB error: ${JSON.stringify(error)}`));

// global variables
var cur_alarmtemp_str = '';
var cur_alarm_str = '';
var cur_temp;

// get twin, create and set properties when 1st connection with azure iothub, handle restart server, handle change of desired property alarmtemp -> set reported property alarm to false
var twinSaved;

client.getTwin()
  .then((twin) => {
    twinSaved = twin;
    twin.on('properties.desired.alarmtemp', (desiredChange) => {
       console.log('In twin.on');
       cur_alarmtemp_str = `${JSON.stringify(desiredChange)}`;
       io.emit('twin property alarmtemp', cur_alarmtemp_str);
       // 1st server run & connection with azure iothub (-> alarmtempcopy not yet created) OR alarmtemp changed? else: twin.on called because of restart server, !!! getTwin calls the desired changed twin.on
       if ((twin.properties.reported && !('alarmtempcopy' in twin.properties.reported)) || twin.properties.reported.alarmtempcopy != twin.properties.desired.alarmtemp) {
         console.log('received new desired properties: ' + cur_alarmtemp_str);
         twin.properties.reported.update({ alarm: false, alarmtempcopy: twin.properties.desired.alarmtemp }, (error) => {
           if (error) {
              console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
           } else {
              console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twin.properties.reported.alarm })}`);
              cur_alarm_str = twin.properties.reported.alarm + ' (not yet checked/calculated with new alarmtemp)';
              io.emit('twin property alarm', cur_alarm_str);
           }
         });
       }
       else {
         cur_alarm_str = twin.properties.reported.alarm + ' (last time server ran)';
         io.emit('twin property alarm', cur_alarm_str);
       }
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

// alarm reset: direct method
client.onDeviceMethod('alarmreset', () => {
   console.log("ALARMRESET");
   if (twinSaved != undefined) {
      twinSaved.properties.reported.update({ alarm: false }, (error) => {
         if (error) {
            console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
         } else {
            console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twinSaved.properties.reported.alarm })}`);
            cur_alarm_str = twinSaved.properties.reported.alarm + ' (reset)';
            io.emit('twin property alarm', cur_alarm_str);
         }
      });
   }
});

// update twin reported property alarm after new temp
function updateTwinAfterTemp(temp) {
   var alarmflag = false;
   if (temp >= parseInt(cur_alarmtemp_str))
      alarmflag = true;
   twinSaved.properties.reported.update({ alarm: alarmflag }, (error) => {
      if (error) {
         console.log(`error updating twin reported properties: ${JSON.stringify(error)}`);
      } else {
         console.log(`twin reported properties updated: ${JSON.stringify({ alarm: twinSaved.properties.reported.alarm })}`);
         cur_alarm_str = twinSaved.properties.reported.alarm.toString();
         io.emit('twin property alarm', cur_alarm_str);
      }
   });
}
// iothub.js code stop

// socket.io
// connect & disconnect
io.on('connection', (socket) => {
  console.log('a user connected');
  if (cur_alarmtemp_str != '')
   socket.emit('twin property alarmtemp', cur_alarmtemp_str);
  if (cur_alarm_str != '')
   socket.emit('twin property alarm', cur_alarm_str);
  socket.on('disconnect', () => {
   console.log('user disconnected');
  });
});

// listen to 'gauge charts loaded', 'temp' -> measure temperature (sensor) -> call functions, 'chat message'
io.on('connection', (socket) => {
  socket.on('gauge charts loaded', (msg) => {
    if (cur_temp != undefined) {
      socket.emit('temp', cur_temp);
    }
  });
  socket.on('temp', (msg) => {
    i2cbus.openPromisified(1).
      then(i2c1  => i2c1.readByte(0x48, 0x00).
        then(temperature => {
          cur_temp = temperature;
          io.emit('temp', temperature);
          sendTemp(temperature);
          updateTwinAfterTemp(temperature);
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

// server listen
server.listen(3000, () => {
  console.log('listening on *:3000');
});
