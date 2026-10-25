let chart;

function fmt(value, digits = 1) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(digits);
}
function shortTime(value) {
  const d = new Date(value);
  return d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
}
async function loadDashboard() {
  const [readingsResponse, statusResponse] = await Promise.all([
    fetch("/api/readings?limit=24"),
    fetch("/api/status")
  ]);
  const readings = await readingsResponse.json();
  const status = await statusResponse.json();
  if (!readings.length) return;
  const latest = readings[readings.length - 1];

  document.getElementById("moisture").textContent = fmt(latest.soil_moisture);
  document.getElementById("temperature").textContent = fmt(latest.soil_temperature);
  document.getElementById("nitrogen").textContent = fmt(latest.nitrogen, 0);
  document.getElementById("phosphorus").textContent = fmt(latest.phosphorus, 0);
  document.getElementById("potassium").textContent = fmt(latest.potassium, 0);
  document.getElementById("moistureBar").style.width = `${Math.min(100, latest.soil_moisture || 0)}%`;
  document.getElementById("lastUpdated").textContent = `Latest: ${new Date(latest.sampled_at).toLocaleString()}`;
  document.getElementById("robotState").textContent = status.robot_state;
  document.getElementById("battery").textContent = `${status.battery_percent}%`;

  const rows = readings.slice().reverse().slice(0, 8).map(r => `
    <tr>
      <td><strong>${escapeHtml(r.sample_id)}</strong></td>
      <td>${new Date(r.sampled_at).toLocaleString()}</td>
      <td>${fmt(r.soil_moisture)}%</td>
      <td>${fmt(r.soil_temperature)} °C</td>
      <td>${fmt(r.nitrogen, 0)}</td>
      <td>${fmt(r.phosphorus, 0)}</td>
      <td>${fmt(r.potassium, 0)}</td>
      <td><span class="tiny-tag">${r.status === "demo" ? "DEMO" : "UNVERIFIED"}</span></td>
    </tr>`).join("");
  document.getElementById("historyRows").innerHTML = rows;
  document.getElementById("sampleCount").textContent = `${readings.length} recent samples`;
  drawChart(readings);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}
function drawChart(readings) {
  const ctx = document.getElementById("trendChart");
  const data = {
    labels: readings.map(r => shortTime(r.sampled_at)),
    datasets: [
      {label:"Moisture (%)", data:readings.map(r=>r.soil_moisture), borderColor:"#36845a", backgroundColor:"rgba(54,132,90,.08)", fill:true, tension:.35, pointRadius:2, yAxisID:"y"},
      {label:"Temperature (°C)", data:readings.map(r=>r.soil_temperature), borderColor:"#d9954b", backgroundColor:"transparent", tension:.35, pointRadius:2, yAxisID:"y1"}
    ]
  };
  if (chart) {
    chart.data = data;
    chart.update();
    return;
  }
  chart = new Chart(ctx, {
    type:"line", data,
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:7,font:{size:10},color:"#68766d"}}},
      scales:{
        x:{grid:{display:false},ticks:{maxTicksLimit:7,color:"#89958d",font:{size:10}}},
        y:{position:"left",grid:{color:"#eef1ee"},ticks:{color:"#89958d",font:{size:10}}},
        y1:{position:"right",grid:{drawOnChartArea:false},ticks:{color:"#89958d",font:{size:10}}}
      }
    }
  });
}
document.getElementById("refreshBtn").addEventListener("click", loadDashboard);
document.getElementById("newSampleBtn").addEventListener("click", async function() {
  this.disabled = true;
  this.textContent = "Generating…";
  try {
    await fetch("/api/demo/sample", {method:"POST"});
    await loadDashboard();
  } finally {
    this.disabled = false;
    this.textContent = "＋ Generate sample";
  }
});
loadDashboard();
setInterval(loadDashboard, 15000);
