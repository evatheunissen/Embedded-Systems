$(document).ready(() => {
  var last_query;
  var selected_dates = [];

  const picker = $("#datetime_range").flatpickr({
    mode: "range",
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    onClose: function(selectedDates, dateStr, instance) {
        if (listOfDevices[listOfDevices.selectedIndex].text && selectedDates.length == 2) {
            var start_dt = new Date(selectedDates[0].toISOString());
            var end_dt = new Date(selectedDates[1].toISOString());
            var findQuery_dt = { Device: { $eq: listOfDevices[listOfDevices.selectedIndex].text }, Date: { $gte: start_dt, $lte: end_dt } };
            socket.emit('get data', findQuery_dt);
            last_query = findQuery_dt;
            selected_dates.length = 0;
            selected_dates.push(...selectedDates);
        }
        else
            alert("Please select a device and a datetime range for successful datetime filtering");
    }
  });

  const socket = io();

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

  // Manage a list of devices in the UI, and update which device data the chart is showing
  // based on selection
  const listOfDevices = document.getElementById("listOfDevices");

  function OnSelectionChange() {
     var findQuery;
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

  function OnFocus() {
     socket.emit('get devices');
  }
  listOfDevices.addEventListener("focus", OnFocus);

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

  const refresh = document.getElementById("refresh");
  refresh.addEventListener("click", OnRefresh);

  function OnRefresh() {
     if (last_query != undefined)
       socket.emit('get data', last_query);
  }

  socket.on('get data', function (message) {
     var temperature_arr = message[0];
     var date_arr = message[1];
     chartData.labels = date_arr;
     chartData.datasets[0].data = temperature_arr;
     myLineChart.update();
  });
});
