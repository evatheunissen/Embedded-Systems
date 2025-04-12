
     const socket = io();

     const messages = document.getElementById('messages');
     const form = document.getElementById('form');
     const input = document.getElementById('input');

     form.addEventListener('submit', function(e) {
       e.preventDefault();
       if (input.value) {
         socket.emit('chat message', input.value);
         input.value = '';
       }
     });

     socket.on('chat message', function(msg) {
       var item = document.createElement('li');
       item.textContent = msg;
       messages.appendChild(item);
       window.scrollTo(0, document.body.scrollHeight);
     });

     socket.on('chat message gpio ques', function(msg) {
       var item = document.createElement('li');
       item.textContent = msg;
       item.style.color = "green";
       messages.appendChild(item);
       window.scrollTo(0, document.body.scrollHeight);
     });

     socket.on('chat message gpio ans', function(msg) {
       var item = document.createElement('li');
       item.textContent = msg;
       item.style.color = "red";
       messages.appendChild(item);
       window.scrollTo(0, document.body.scrollHeight);
     });

     socket.on('temp', function(msg) {
       var temperature = msg;
       gaugeData.setValue(0, 0, temperature);
       gauge.draw(gaugeData, gaugeOptions);
       window.scrollTo(0, 0);
     });

     socket.on('twin property alarmtemp', function(msg) {
        document.getElementById('alarmtemp').innerHTML = 'Alarm temperature: ' + msg;
     });

     socket.on('twin property alarm', function(msg) {
        document.getElementById('alarm').innerHTML = 'Alarm: ' + msg;
     });


     google.charts.load('current', {'packages':['gauge']});
     google.charts.setOnLoadCallback(drawGauge);

     const gaugeOptions = {min: 0, max: 100, yellowFrom: 80, yellowTo: 95,
                           redFrom: 95, redTo: 100, minorTicks: 5};
     var gauge;

     function drawGauge() {
       gaugeData = new google.visualization.DataTable();
       gaugeData.addColumn('number', 'Temp');
       gaugeData.addRows(1);
       gaugeData.setCell(0, 0, 0);

       gauge = new google.visualization.Gauge(document.getElementById('gauge_div'));
       gauge.draw(gaugeData, gaugeOptions);

       socket.emit('gauge charts loaded');
     }

     function getTemp() {
       socket.emit('temp');
     }

