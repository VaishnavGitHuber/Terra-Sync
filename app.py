from flask import Flask, render_template, jsonify, request
import random
import time
import math

app = Flask(__name__)

PLOTS = [
    {"name": "Plot A", "xmin": 5, "xmax": 30, "ymin": 18, "ymax": 82},
    {"name": "Plot B", "xmin": 37, "xmax": 62, "ymin": 18, "ymax": 82},
    {"name": "Plot C", "xmin": 69, "xmax": 94, "ymin": 18, "ymax": 82},
]

MISSION_DURATION_SECONDS = 2000

def build_plot_route(plot, start_from="top-left"):
    left = plot["xmin"]
    right = plot["xmax"]
    top = plot["ymin"]
    bottom = plot["ymax"]

    row_count = 6
    rows = [
        top + (bottom - top) * i / (row_count - 1)
        for i in range(row_count)
    ]

    if start_from.startswith("bottom"):
        rows.reverse()

    start_right = start_from.endswith("right")
    points = []

    for i, y in enumerate(rows):
        go_right = start_right if i % 2 == 0 else not start_right
        first_x = right if go_right else left
        last_x = left if go_right else right

        if i == 0:
            points.append({"x": first_x, "y": y})
        else:
            points.append({"x": first_x, "y": y})

        points.append({"x": last_x, "y": y})

    return points

ROUTE = []
plot_routes = [
    build_plot_route(PLOTS[0], "top-left"),
    build_plot_route(PLOTS[1], "bottom-left"),
    build_plot_route(PLOTS[2], "top-right"),
]

for plot_route in plot_routes:
    if ROUTE:
        ROUTE.append(plot_route[0])
        ROUTE.extend(plot_route[1:])
    else:
        ROUTE.extend(plot_route)

clean_route = []
for point in ROUTE:
    if not clean_route or (
        point["x"] != clean_route[-1]["x"]
        or point["y"] != clean_route[-1]["y"]
    ):
        clean_route.append(point)

ROUTE = clean_route

def route_length(route):
    total = 0.0
    for i in range(1, len(route)):
        dx = route[i]["x"] - route[i - 1]["x"]
        dy = route[i]["y"] - route[i - 1]["y"]
        total += math.hypot(dx, dy)
    return total

TOTAL_ROUTE_LENGTH = route_length(ROUTE)
MAP_UNITS_PER_SECOND = TOTAL_ROUTE_LENGTH / MISSION_DURATION_SECONDS

robot = {
    "status": "Ready",
    "battery": 86.0,
    "speed": 0.0,
    "coverage": 0.0,

    "soil_moisture": 42.0,
    "soil_ph": 6.8,
    "soil_temp": 24.6,
    "nitrogen": 38,
    "phosphorus": 24,
    "potassium": 31,

    # Water Quality Sensors
    "kws_sensor": 450.0,
    "nplk_sensor": 12.4,

    # Camera & AI Insights
    "camera_status": "Active",
    "detected_crop": "Tomato Crop (Healthy)",
    "pest_detected": "None Detected",
    "confidence": 96.4,
    "leaf_health_index": "92%",
    "snapshot_id": "CAM_IMG_1042.jpg",

    # Recommendations & Alerts
    "alerts": [
        {"type": "info", "message": "Optimal soil nitrogen levels detected in Plot A."},
        {"type": "warning", "message": "Slight moisture drop in Plot B. Consider scheduled irrigation."}
    ],
    "recommendations": [
        "Apply potassium-rich foliar spray in Plot C within 48 hours.",
        "Maintain current robot patrol speed for optimal camera focus."
    ],

    "motor_temp": 39.2,
    "gps": {"lat": 25.0330, "lon": 121.5654},
    "signal": 98,

    "mission_active": False,
    "emergency": False,
    "last_update": time.time(),

    "map_position": ROUTE[0].copy(),
    "waypoint_index": 1,
    "route_progress": 0.0,
}

def update_gps_from_map():
    x = robot["map_position"]["x"]
    y = robot["map_position"]["y"]
    robot["gps"]["lat"] = round(25.0330 + (50 - y) * 0.00002, 6)
    robot["gps"]["lon"] = round(121.5654 + (x - 50) * 0.00003, 6)

def reset_mission():
    robot["map_position"] = ROUTE[0].copy()
    robot["waypoint_index"] = 1
    robot["route_progress"] = 0.0
    robot["coverage"] = 0.0
    robot["battery"] = 86.0
    robot["last_update"] = time.time()
    update_gps_from_map()

def advance_robot():
    now = time.time()
    elapsed = min(now - robot["last_update"], 1.0)
    robot["last_update"] = now

    if not robot["mission_active"] or robot["emergency"]:
        robot["speed"] = 0.0
        return

    remaining = MAP_UNITS_PER_SECOND * elapsed

    while remaining > 0 and robot["waypoint_index"] < len(ROUTE):
        target = ROUTE[robot["waypoint_index"]]
        current = robot["map_position"]

        dx = target["x"] - current["x"]
        dy = target["y"] - current["y"]
        distance = math.hypot(dx, dy)

        if distance < 0.0001:
            current["x"] = target["x"]
            current["y"] = target["y"]
            robot["waypoint_index"] += 1
            continue

        step = min(remaining, distance)
        ratio = step / distance

        current["x"] += dx * ratio
        current["y"] += dy * ratio
        remaining -= step

        if step >= distance:
            current["x"] = target["x"]
            current["y"] = target["y"]
            robot["waypoint_index"] += 1

    robot["route_progress"] = min(
        100.0,
        100.0 * (robot["waypoint_index"] - 1)
        / max(1, len(ROUTE) - 1)
    )

    robot["coverage"] = robot["route_progress"]
    robot["battery"] = max(
        5.0, robot["battery"] - elapsed * 0.004
    )

    update_gps_from_map()

    if robot["waypoint_index"] >= len(ROUTE):
        robot["mission_active"] = False
        robot["status"] = "Mission Complete"
        robot["speed"] = 0.0
        robot["coverage"] = 100.0
    else:
        robot["speed"] = round(
            MAP_UNITS_PER_SECOND, 3
        )

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/sensors")
def sensors_page():
    return render_template("sensors.html")

@app.route("/soil-water")
def soil_water_page():
    return render_template("soil_water.html")

@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html")

@app.route("/api/chat", methods=["POST"])
def chat_api():
    data = request.get_json(silent=True) or {}
    msg = data.get("message", "").lower()
    
    if "battery" in msg:
        reply = f"Current robot battery stands at {round(robot['battery'], 1)}%. System status is {robot['status']}."
    elif "moisture" in msg or "soil" in msg:
        reply = f"Soil moisture is currently {robot['soil_moisture']}%, pH is {robot['soil_ph']}, and soil temperature is {robot['soil_temp']} °C."
    elif "water" in msg or "irrigation" in msg:
        reply = f"Water quality sensor reads KWS (EC/TDS): {robot['kws_sensor']} ppm and NPLK index: {robot['nplk_sensor']} mg/L. Fluid status is optimal."
    elif "camera" in msg or "pest" in msg or "insight" in msg:
        reply = f"Camera AI detection: {robot['detected_crop']} with {robot['confidence']}% confidence. Pest status: {robot['pest_detected']}."
    elif "mission" in msg or "status" in msg or "coverage" in msg:
        reply = f"Mission status: {robot['status']}. Field coverage achieved: {round(robot['coverage'], 1)}%."
    else:
        reply = "Hello! I am your TerraSync AgriBot Assistant. Ask me about battery levels, soil metrics, water quality, camera insights, or mission progress!"
        
    return jsonify({"reply": reply})

@app.route("/api/data")
def get_data():
    advance_robot()

    robot["soil_moisture"] = round(
        max(15, min(70, robot["soil_moisture"] + random.uniform(-0.3, 0.3))), 1
    )
    robot["soil_ph"] = round(
        max(5.5, min(8.0, robot["soil_ph"] + random.uniform(-0.02, 0.02))), 2
    )
    robot["soil_temp"] = round(
        robot["soil_temp"] + random.uniform(-0.1, 0.1), 1
    )
    robot["motor_temp"] = round(
        robot["motor_temp"] + random.uniform(-0.2, 0.3), 1
    )
    robot["signal"] = random.randint(90, 100)

    robot["kws_sensor"] = round(
        max(100, min(1000, robot["kws_sensor"] + random.uniform(-2.0, 2.0))), 1
    )
    robot["nplk_sensor"] = round(
        max(0, min(100, robot["nplk_sensor"] + random.uniform(-0.2, 0.2))), 1
    )
    
    robot["confidence"] = round(max(90.0, min(99.9, robot["confidence"] + random.uniform(-0.2, 0.2))), 1)

    result = robot.copy()
    result["gps"] = robot["gps"].copy()
    result["map_position"] = robot["map_position"].copy()
    result["route"] = [point.copy() for point in ROUTE]
    result["plots"] = PLOTS
    result["mission_duration_seconds"] = MISSION_DURATION_SECONDS

    return jsonify(result)

@app.route("/api/control", methods=["POST"])
def control():
    data = request.get_json(silent=True) or {}
    action = data.get("action", "")

    if action == "start":
        if robot["emergency"]:
            return jsonify({"message": "Reset emergency stop first"}), 409

        if robot["status"] in ("Ready", "Stopped", "Mission Complete"):
            reset_mission()

        robot["mission_active"] = True
        robot["status"] = "Running"
        robot["last_update"] = time.time()

    elif action == "pause":
        robot["mission_active"] = False
        robot["status"] = "Paused"

    elif action == "stop":
        robot["mission_active"] = False
        robot["status"] = "Stopped"

    elif action == "return":
        robot["mission_active"] = False
        robot["status"] = "Returning to Base"
        robot["speed"] = 0.0

    elif action == "emergency":
        robot["mission_active"] = False
        robot["emergency"] = True
        robot["status"] = "Emergency Stop"
        robot["speed"] = 0.0

    elif action == "reset":
        robot["mission_active"] = False
        robot["emergency"] = False
        robot["status"] = "Ready"
        reset_mission()

    elif action in ["forward", "backward", "left", "right"]:
        if robot["emergency"]:
            return jsonify({"message": "Emergency stop is active"}), 409

        robot["mission_active"] = False
        robot["status"] = "Manual Control"
        robot["speed"] = 0.0

        current = robot["map_position"]
        step = 1.0

        if action == "forward":
            current["y"] -= step
        elif action == "backward":
            current["y"] += step
        elif action == "left":
            current["x"] -= step
        elif action == "right":
            current["x"] += step

        current["x"] = max(0, min(100, current["x"]))
        current["y"] = max(0, min(100, current["y"]))
        update_gps_from_map()

    else:
        return jsonify({"message": "Unknown action"}), 400

    robot["last_update"] = time.time()

    return jsonify({
        "message": robot["status"],
        "robot": robot
    })

if __name__ == "__main__":
    app.run(debug=True)