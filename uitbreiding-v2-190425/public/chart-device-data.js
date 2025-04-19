$(document).ready(() => {
  // Socket.IO
  const socket = io();

  // Global variables (ref queries)
  var last_query;
  var selected_dates = [];

  // Initialize flatpickr + (see long comment further down) alternative 2.1 socket.emit('get data') filtered on input dates = db find ->
  const picker = $("#datetime_range").flatpickr({
    mode: "range",
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    onClose: function(selectedDates, dateStr, instance) {
        if (listOfDevices[listOfDevices.selectedIndex] && listOfDevices[listOfDevices.selectedIndex].text && selectedDates.length == 2) {
            var start_dt = new Date(selectedDates[0].toISOString());
            var end_dt = new Date(selectedDates[1].toISOString());
            var findQuery_dt = { Device: { $eq: listOfDevices[listOfDevices.selectedIndex].text }, Date: { $gte: start_dt, $lte: end_dt } };
            socket.emit('get data', findQuery_dt);
            last_query = findQuery_dt;
            selected_dates.length = 0;
            selected_dates.push(...selectedDates);
        }
        else {
            instance.setDate(selected_dates); // Previously saved (correct) selectedDates
            alert("Please select a device and a datetime range for successful datetime filtering");
        }
    }
  });
  picker.clear();

  // Define the chart axes
  const chartData = {
    datasets: [
      {
        fill: false,
        label: "Temperature",
        yAxisID: "Temperature",
        borderColor: "rgba(255, 204, 0, 1)",
        pointBoarderColor: "rgba(255, 204, 0, 1)",
        backgroundColor: "rgba(255, 204, 0, 0.4)",
        pointHoverBackgroundColor: "rgba(255, 204, 0, 1)",
        pointHoverBorderColor: "rgba(255, 204, 0, 1)",
        spanGaps: true,
      },
    ],
  };

  const chartOptions = {
    scales: {
      yAxes: [
        {
          id: "Temperature",
          type: "linear",
          scaleLabel: {
            labelString: "Temperature (ºC)",
            display: true,
          },
          position: "left",
          ticks: {
            suggestedMin: 0,
            suggestedMax: 100,
            beginAtZero: true,
          },
        },
      ],
    },
  };

  // Get the context of the canvas element we want to select
  const ctx = document.getElementById("iotChart").getContext("2d");
  const myLineChart = new Chart(ctx, {
    type: "line",
    data: chartData,
    options: chartOptions
  });

  // Create table with Tabulator
  const table = new Tabulator("#log_table", {
    autoColumns:true,
    layout:"fitColumns",
    pagination:"local",
    paginationSize:15,
    paginationCounter:"rows",
  });

  // 1. Update list of devices in the UI-selectbox: get all distinct devices from db
     // 1.1 OnFocus UI-selectbox: socket.emit('get devices') = db find ->
     // 1.2 socket.on('get devices') = db result (update list of devices only if distinct devices have changed)
  // 2. Update which device (& datetime) data from the db the chart and table are showing based on selection (& datetime filter)
     // 2.1 OnSelectionChange UI-selectbox: socket.emit('get data') = db find ->
     // 2.2 socket.on('get data') = db result
  const listOfDevices = document.getElementById("listOfDevices");

  // 1.1
  function OnFocus() {
     socket.emit('get devices');
  }
  listOfDevices.addEventListener("focus", OnFocus);

  // 1.2
  var devices_remember = [];

  socket.on('get devices', function (message) {
     var devices = message;
     if(JSON.stringify([...devices].sort()) !== JSON.stringify([...devices_remember].sort())) {
       while (listOfDevices.hasChildNodes())
         listOfDevices.removeChild(listOfDevices.firstChild)
       devices.forEach(append_all_devices);
       listOfDevices.selectedIndex = -1;
       devices_remember.length = 0;
       devices_remember.push(...devices);
     }
  });

  function append_all_devices(device) {
     var node = document.createElement("option");
     var nodeText = document.createTextNode(device);
     node.appendChild(nodeText);
     listOfDevices.appendChild(node);
  }

  // 2.1
  function OnSelectionChange() {
     var findQuery;
     //console.log(picker.selectedDates.toString());
     //console.log(selected_dates.toString());
     if (selected_dates.length == 2) {
         var start = new Date(selected_dates[0].toISOString());
         var end = new Date(selected_dates[1].toISOString());
         findQuery = { Device: { $eq: listOfDevices[listOfDevices.selectedIndex].text }, Date: { $gte: start, $lte: end } };
     }
     else
         findQuery = { Device: { $eq: listOfDevices[listOfDevices.selectedIndex].text } };
     socket.emit('get data', findQuery);
     last_query = findQuery;
  }
  listOfDevices.addEventListener("change", OnSelectionChange, false);

  // Alternative 2.1 socket.emit('get data') based on last query = db find ->
  const refresh = document.getElementById("refresh");
  refresh.addEventListener("click", OnRefresh);

  function OnRefresh() {
     if (last_query != undefined)
       socket.emit('get data', last_query);
  }

  // 2.2
  socket.on('get data', function (message) {
     var table_data = [...message];
     var temperature_arr = [];
     var date_arr = [];
     table_data.forEach(temp_log => {
       temperature_arr.push(temp_log.Temperature);
       date_arr.push(temp_log.Date);
     });
     chartData.labels = date_arr;
     chartData.datasets[0].data = temperature_arr;
     myLineChart.update();
     table.setData(table_data);
  });
});
