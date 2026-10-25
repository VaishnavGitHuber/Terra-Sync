// ============================================
// TerraSync - Robot Control & Live Monitoring
// ============================================

const MAX_HISTORY = 30;
const REFRESH_INTERVAL = 200;

const labels = [];
const soilHistory = [];
const speedHistory = [];

let soilChart = null;
let speedChart = null;
let isRefreshing = false;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function addVariation(value, amount, min, max) {
    const variation = (Math.random() - 0.5) * amount;
    return clamp(value + variation, min, max);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

async function command(action) {
    try {
        const response = await fetch("/api/control", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ action })
        });

        const result = await response.json();

        if (!response.ok) {
            console.warn(result.message || "Command failed.");
            return;
        }

        await refreshData();
    } catch (error) {
        console.error("Control command failed:", error);
    }
}

function createChart(canvasId, label, color, data, maxValue, unit) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    return new Chart(canvas, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: color + "20",
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: color,
                pointBorderWidth: 0,
                cubicInterpolationMode: "monotone"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: "index"
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return label + ": " + Number(context.parsed.y).toFixed(2) + " " + unit;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    min: 0,
                    max: maxValue,
                    grid: { color: "rgba(128,128,128,0.15)" },
                    ticks: {
                        maxTicksLimit: 6,
                        callback: function(value) {
                            return value + (unit === "%" ? "%" : "");
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0,
                        autoSkip: true
                    }
                }
            }
        }
    });
}

function updateHistory(soilMoisture, robotSpeed) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    labels.push(timeLabel);
    soilHistory.push(clamp(soilMoisture, 0, 80));
    speedHistory.push(clamp(robotSpeed, 0, 1.5));

    while (labels.length > MAX_HISTORY) {
        labels.shift();
        soilHistory.shift();
        speedHistory.shift();
    }

    if (!soilChart) {
        soilChart = createChart("soilChart", "Soil moisture", "#3c9655", soilHistory, 80, "%");
    } else {
        soilChart.data.labels = labels;
        soilChart.data.datasets[0].data = soilHistory;
        soilChart.update("none");
    }

    if (!speedChart) {
        speedChart = createChart("speedChart", "Robot speed", "#4b9ac7", speedHistory, 1.5, "m/s");
    } else {
        speedChart.data.labels = labels;
        speedChart.data.datasets[0].data = speedHistory;
        speedChart.update("none");
    }
}

function drawRoute(map, route) {
    if (!map || !Array.isArray(route) || route.length === 0) return;

    let svg = map.querySelector(".robot-route-overlay");
    if (svg) return;

    const svgNS = "http://www.w3.org/2000/svg";
    svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "robot-route-overlay");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    Object.assign(svg.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "2",
        pointerEvents: "none",
        overflow: "visible"
    });

    const routeLine = document.createElementNS(svgNS, "polyline");
    routeLine.setAttribute("points", route.map(point => `${point.x},${point.y}`).join(" "));
    routeLine.setAttribute("fill", "none");
    routeLine.setAttribute("stroke", "#f0a52b");
    routeLine.setAttribute("stroke-width", "0.7");
    routeLine.setAttribute("stroke-dasharray", "1.5 1");
    routeLine.setAttribute("stroke-linecap", "round");
    routeLine.setAttribute("stroke-linejoin", "round");

    svg.appendChild(routeLine);

    route.forEach((point, index) => {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "0.9");
        circle.setAttribute("fill", "#ffffff");
        circle.setAttribute("stroke", "#f0a52b");
        circle.setAttribute("stroke-width", "0.4");
        circle.setAttribute("data-waypoint", index);
        svg.appendChild(circle);
    });

    map.insertBefore(svg, map.firstChild);
}

function moveRobotMarker(data) {
    const marker = document.getElementById("mapRobot");
    if (!marker) return;

    if (data.route && marker.parentElement) {
        const map = marker.parentElement;
        if (getComputedStyle(map).position === "static") {
            map.style.position = "relative";
        }
        drawRoute(map, data.route);
    }

    if (!data.map_position) return;

    const x = clamp(Number(data.map_position.x), 0, 100);
    const y = clamp(Number(data.map_position.y), 0, 100);

    marker.style.position = "absolute";
    marker.style.left = x + "%";
    marker.style.top = y + "%";
    marker.style.transform = "translate(-50%, -50%)";
    marker.style.zIndex = "3";
    marker.style.transition = "left 2s linear, top 2s linear";
}

async function refreshData() {
    if (isRefreshing) return;
    isRefreshing = true;

    try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to retrieve telemetry");

        const d = await response.json();

        setText("status", d.status);
        setText("battery", Math.round(d.battery));
        setText("coverage", Math.round(d.coverage));

        const coverageBar = document.getElementById("coverageBar");
        if (coverageBar) {
            coverageBar.style.width = clamp(Number(d.coverage), 0, 100) + "%";
        }

        setText("soilMoisture", d.soil_moisture + "%");
        setText("ph", d.soil_ph);
        setText("temp", d.soil_temp + " °C");
        setText("nitrogen", d.nitrogen + " mg/kg");
        setText("phosphorus", d.phosphorus + " mg/kg");
        setText("potassium", d.potassium + " mg/kg");

        // Water Quality sensors
        setText("kwsSensor", d.kws_sensor + " ppm");
        setText("nplkSensor", d.nplk_sensor + " mg/L");

        // Camera AI Insights
        setText("detectedCrop", d.detected_crop);
        setText("pestStatus", d.pest_detected);
        setText("leafHealth", d.leaf_health_index);
        setText("snapshotId", d.snapshot_id);
        setText("aiConf", "Confidence: " + d.confidence + "%");

        setText("lat", Number(d.gps.lat).toFixed(5));
        setText("lon", Number(d.gps.lon).toFixed(5));
        setText("speed", Number(d.speed).toFixed(2) + " m/s");
        setText("signal", d.signal + "%");

        moveRobotMarker(d);

        const displayedMoisture = addVariation(Number(d.soil_moisture), 3, 0, 80);
        const displayedSpeed = addVariation(Number(d.speed), 0.12, 0, 1.5);

        updateHistory(displayedMoisture, displayedSpeed);

    } catch (error) {
        console.error("Telemetry update failed:", error);
    } finally {
        isRefreshing = false;
    }
}

refreshData();
setInterval(refreshData, REFRESH_INTERVAL);