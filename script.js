document.addEventListener('DOMContentLoaded', () => {
    // === CONFIGURATION ===
    // Note: Ensure Mosquitto has a WebSocket listener enabled on port 9001 in mosquitto.conf:
    // listener 9001
    // protocol websockets
    const MQTT_BROKER = 'ws://10.229.21.178:9001'; 
    const TOPIC = 'esp32/21138559/data'; 
    const MAX_DATA_POINTS = 30;

    // === STATE ===
    let messagesReceived = 0;
    let startTime = Date.now();
    let sensorData = { temp: [], hum: [], dist: [], light: [] };

    // === UI ELEMENTS ===
    const mqttDot = document.getElementById('mqtt-dot');
    const mqttText = document.getElementById('mqtt-status-text');
    const lastUpdateEl = document.getElementById('last-update');
    const msgCountEl = document.getElementById('msg-count');
    const alertsContainer = document.getElementById('alerts-container');
    const iconLightAnim = document.getElementById('icon-light-anim');
    const notificationBell = document.getElementById('notification-bell');

    // === TIME & UPTIME LOOP ===
    setInterval(() => {
        const now = new Date();
        document.getElementById('current-time').innerText = now.toLocaleTimeString();
        document.getElementById('current-date').innerText = now.toLocaleDateString();
        
        const diff = Math.floor((now.getTime() - startTime) / 1000);
        const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        document.getElementById('uptime').innerText = `${hrs}:${mins}:${secs}`;
    }, 1000);

    // === CHART.JS SETUP ===
    const chartConfig = (label, color) => ({
        type: 'line',
        data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color + '33', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: false }, y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
    });

    const charts = {
        temp: new Chart(document.getElementById('chart-temp').getContext('2d'), chartConfig('Temperature (°C)', '#ef4444')),
        hum: new Chart(document.getElementById('chart-hum').getContext('2d'), chartConfig('Humidity (%)', '#00d2ff')),
        dist: new Chart(document.getElementById('chart-dist').getContext('2d'), chartConfig('Distance (cm)', '#a200ff')),
        light: new Chart(document.getElementById('chart-light').getContext('2d'), chartConfig('Light Level', '#ffeb3b'))
    };

    function updateChart(chart, value, label) {
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(value);
        if (chart.data.labels.length > MAX_DATA_POINTS) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
        }
        chart.update();
    }

    // === MQTT CONNECTION ===
    const client = mqtt.connect(MQTT_BROKER, { reconnectPeriod: 3000 });

    client.on('connect', () => {
        mqttDot.classList.replace('disconnected', 'connected');
        mqttText.innerText = 'Connected';
        console.log(`Connected to MQTT Broker: ${MQTT_BROKER}`);
        
        // Subscribe to the sensor data topic
        client.subscribe(TOPIC);
    });

    client.on('error', (err) => {
        console.error('MQTT Error:', err);
    });

    client.on('close', () => {
        mqttDot.classList.replace('connected', 'disconnected');
        mqttText.innerText = 'Disconnected';
    });

    // === HANDLE MESSAGES ===
    client.on('message', (topic, message) => {
        if (topic === TOPIC) {
            try {
                // Parse the JSON payload from the ESP32
                const data = JSON.parse(message.toString());
                const timestamp = new Date().toLocaleTimeString();
                
                messagesReceived++;
                msgCountEl.innerText = messagesReceived;
                lastUpdateEl.innerText = timestamp;

                // Match exact key names emitted in the JSON payload
                if (data.temperature !== undefined) handleTemperature(Number(data.temperature), timestamp);
                if (data.humidity !== undefined) handleHumidity(Number(data.humidity), timestamp);
                if (data.distance !== undefined) handleDistance(Number(data.distance), timestamp);
                if (data.light !== undefined) handleLight(Number(data.light), timestamp);

                triggerBellAnimation();
            } catch (e) {
                console.error("Failed to parse JSON payload:", e);
            }
        }
    });

    // === DATA HANDLERS & GAUGES ===
    function setGauge(id, value, maxVal) {
        document.getElementById(`val-${id}`).innerText = value;
        const degrees = Math.min((value / maxVal) * 360, 360);
        document.getElementById(`gauge-${id}`).style.setProperty('--percentage', `${degrees}deg`);
    }

    function handleTemperature(val, ts) {
        const gauge = document.getElementById('gauge-temp');
        if (val < 20) gauge.style.setProperty('--gauge-color', 'var(--primary)');
        else if (val <= 30) gauge.style.setProperty('--gauge-color', 'var(--success)');
        else {
            gauge.style.setProperty('--gauge-color', 'var(--danger)');
            showAlert('High Temperature Warning!', 'danger');
        }
        setGauge('temp', val.toFixed(1), 50);
        updateChart(charts.temp, val, ts);
        sensorData.temp.push({ val, ts });
    }

    function handleHumidity(val, ts) {
        setGauge('hum', val.toFixed(1), 100);
        if (val > 85) showAlert('High Humidity Alert!', 'warning');
        updateChart(charts.hum, val, ts);
        sensorData.hum.push({ val, ts });
    }

    function handleDistance(val, ts) {
        setGauge('dist', val.toFixed(0), 400); // HC-SR04 max is ~400cm
        if (val < 10) showAlert('Proximity Alert: Object too close!', 'danger');
        updateChart(charts.dist, val, ts);
        sensorData.dist.push({ val, ts });
    }

    function handleLight(val, ts) {
        setGauge('light', val.toFixed(0), 4095); // 12-bit ADC LDR (0-4095)
        const statusEl = document.getElementById('status-light');
        if (val < 100) {
            statusEl.innerText = 'DARK';
            iconLightAnim.className = 'fa-regular fa-lightbulb icon-light';
            showAlert('Low Light Level Detected!', 'warning');
        } else if (val < 1000) {
            statusEl.innerText = 'DIM';
            iconLightAnim.className = 'fa-solid fa-lightbulb icon-light';
            iconLightAnim.classList.remove('glow');
        } else {
            statusEl.innerText = 'BRIGHT';
            iconLightAnim.className = 'fa-solid fa-lightbulb icon-light glow';
        }
        updateChart(charts.light, val, ts);
        sensorData.light.push({ val, ts });
    }

    // === ALERTS SYSTEM ===
    let activeAlerts = new Set();
    function showAlert(message, type) {
        if (activeAlerts.has(message)) return; // Prevent spam
        activeAlerts.add(message);
        
        const alertEl = document.createElement('div');
        alertEl.className = `alert ${type}`;
        alertEl.innerText = message;
        alertsContainer.appendChild(alertEl);
        
        setTimeout(() => {
            alertEl.classList.add('fade-out');
            setTimeout(() => {
                alertEl.remove();
                activeAlerts.delete(message);
            }, 500);
        }, 5000);
    }

    function triggerBellAnimation() {
        notificationBell.style.transform = 'rotate(15deg)';
        setTimeout(() => notificationBell.style.transform = 'rotate(0deg)', 200);
    }

    // === EXTRA FEATURES ===
    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const root = document.documentElement;
        const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', newTheme);
    });

    // Fullscreen Toggle
    document.getElementById('fullscreen-toggle').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.log(err));
        } else {
            document.exitFullscreen();
        }
    });

    // Refresh Page
    document.getElementById('refresh-btn').addEventListener('click', () => location.reload());

    // Export JSON
    document.getElementById('btn-json').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sensorData, null, 2));
        downloadFile(dataStr, 'sensor_data.json');
    });

    // Export CSV
    document.getElementById('btn-csv').addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Timestamp,Temperature,Humidity,Distance,Light\n";
        const length = Math.min(sensorData.temp.length, 30);
        for (let i = 0; i < length; i++) {
            const t = sensorData.temp[i] ? sensorData.temp[i].val : '';
            const h = sensorData.hum[i] ? sensorData.hum[i].val : '';
            const d = sensorData.dist[i] ? sensorData.dist[i].val : '';
            const l = sensorData.light[i] ? sensorData.light[i].val : '';
            const ts = sensorData.temp[i] ? sensorData.temp[i].ts : '';
            csvContent += `${ts},${t},${h},${d},${l}\n`;
        }
        downloadFile(csvContent, 'sensor_history.csv');
    });

    function downloadFile(content, fileName) {
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", content);
        downloadAnchorNode.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
});