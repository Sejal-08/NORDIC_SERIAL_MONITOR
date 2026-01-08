

let selectedCACertFile = null;
let selectedClientKeyFile = null;

// Certificate file paths for Weather Station MQTT
let weatherCACert = null;
let weatherDeviceCert = null;
let weatherPrivateKey = null;

// Certificate file paths for Gateway MQTT
let gatewayCACert = null;
let gatewayDeviceCert = null;
let gatewayPrivateKey = null;

// Sensor protocol to sensor mapping
const sensorProtocolMap = {
  I2C: ["BME680", "VEML7700"],
  ADC: ["Battery Voltage", "Rain Gauge"],
  RS232: ["Ultrasonic Sensor"],
  RS485: [],
  SPI: [],
};

// Track sensor presence and data
let sensorStatus = {
  I2C: { BME680: false, VEML7700: false },
  ADC: { "Battery Voltage": false, "Rain Gauge": false },
  RS232: { "Ultrasonic Sensor": false },
  RS485: {},
  SPI: {},
};

let sensorData = { I2C: {}, ADC: {}, RS232: {}, RS485: {}, SPI: {} };
let currentTemperature = null;
let currentHumidity = null;
let currentPressure = null;
let currentLight = null;
let isConnected = false;
let currentBaud = 115200;
let currentPort = "";
let isGatewayConnected = false;
let currentGatewayPort = "";
let currentGatewayBaud = 115200;


// === SINGLE, BEST gatewayLog FUNCTION (ONLY ONE IN THE FILE) ===
function gatewayLog(message, type = "default") {
  const output = document.getElementById("gateway-output");
  if (!output) {
    console.error("gateway-output element not found!");
    return;
  }
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Just raw message – no time, no prefix
  output.innerHTML += `<span class="log-raw">${escaped}</span><br>`;
  output.scrollTop = output.scrollHeight;

  // Still useful for console debugging
  console.log(`[GATEWAY] ${message}`);
}


/* ------------------------------------------------------------------ */
/*  WEATHER STATION RAW LOG LISTENER                                  */
/* ------------------------------------------------------------------ */
if (window.electronAPI && typeof window.electronAPI.onSerialData === "function") {
  console.log("Registering Weather Station serial data listener...");
  
  window.electronAPI.onSerialData((rawData) => {
    // Don't buffer - just display immediately for raw output
    const lines = rawData.split(/\r?\n/);
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return; // Skip empty lines

      // Escape HTML special characters
      const escaped = trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const output = document.getElementById("output");
      if (output) {
        output.innerHTML += `<span class="log-raw">${escaped}</span><br>`;
        output.scrollTop = output.scrollHeight;
      }

      console.log(`[WEATHER UI] ${trimmed}`);
    });

    // Also parse for sensor data
    parseSensorData(rawData);
  });

  console.log("Weather Station UART listener registered successfully");
  log("Weather Station UART listener active – raw output will appear here", "info");
} else {
  console.error("electronAPI.onSerialData not available!");
}

// === REGISTER GATEWAY LISTENER EARLY - FIXED CONDITION ===
if (window.electronAPI && typeof window.electronAPI.onGatewaySerialData === "function") {
  let buffer = ""; // Keep incomplete lines across chunks

  window.electronAPI.onGatewaySerialData((rawData) => {
    buffer += rawData;

    // Split on newlines, but keep the last (possibly incomplete) part
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || ""; // remainder stays for next chunk

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return; // skip empty lines

      // We do NOT classify or add any prefix/time anymore
      // Just escape for HTML safety and display raw
      const escaped = trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const output = document.getElementById("gateway-output");
      if (output) {
        // Simple line-by-line display, no extra decorations
        output.innerHTML += `<span class="log-raw">${escaped}</span><br>`;
        output.scrollTop = output.scrollHeight;
      }

      // Optional: still log to console for debugging
      console.log(`[GATEWAY RAW] ${trimmed}`);
    });
  });

  // Initial startup message (optional – remove if you don't want it)
  // gatewayLog("Gateway UART listener active – showing raw firmware output", "success");
}
/* ------------------------------------------------------------------ */
/*  MAIN UI UPDATE                                                    */
/* ------------------------------------------------------------------ */
function updateSensorUI() {
  const protocol = document.getElementById("sensor-select").value;
  const sensorListDiv = document.getElementById("sensor-list");
  const sensorDataDiv = document.getElementById("sensor-data");

  const thermometerContainer = document.getElementById("thermometer-container");
  const humidityCard = document.getElementById("humidity-card");
  const pressureCard = document.getElementById("pressure-card");
  const lightCard = document.getElementById("light-card");
  const batteryCard = document.getElementById("battery-card");
  const rainGaugeHourlyCard = document.getElementById("rain-gauge-hourly-card");
  const rainGaugeDailyCard = document.getElementById("rain-gauge-daily-card");
  const rainGaugeWeeklyCard = document.getElementById("rain-gauge-weekly-card");
  const calibrationSection = document.getElementById("calibration-section");

  const thermometerFill = document.getElementById("thermometer-fill");
  const thermometerBulb = document.getElementById("thermometer-bulb");
  const thermometerValue = document.getElementById("thermometer-value");

  const humidityValue = document.getElementById("humidity-value");
  const wavePath = document.getElementById("wavePath");
  const waveColor1 = document.getElementById("waveColor1");
  const waveColor2 = document.getElementById("waveColor2");

  const pressureValue = document.getElementById("pressure-value");
  const pressureBar = document.getElementById("pressure-bar");

  const lightValue = document.getElementById("light-value");
  const sunCircle = document.getElementById("sun-circle");
  const glowFilter = document.getElementById("glow");
  const sunGradient = document.getElementById("sunGradient");
  const sparkles = document.getElementById("sparkles");

  const batteryValue = document.getElementById("battery-value");
  const batteryFill = document.getElementById("battery-fill");
  const rainGaugeHourlyValue = document.getElementById("rain-gauge-hourly-value");
  const rainGaugeDailyValue = document.getElementById("rain-gauge-daily-value");
  const rainGaugeWeeklyValue = document.getElementById("rain-gauge-weekly-value");

  sensorListDiv.innerHTML = "";
  if (sensorDataDiv) sensorDataDiv.innerHTML = "";

  /* ---------- hide all cards by default ---------- */
  thermometerContainer.style.display = "none";
  humidityCard.style.display = "none";
  pressureCard.style.display = "none";
  lightCard.style.display = "none";
  batteryCard.style.display = "none";
  rainGaugeHourlyCard.style.display = "none";
  rainGaugeDailyCard.style.display = "none";
  rainGaugeWeeklyCard.style.display = "none";
  calibrationSection.style.display = "none";

  if (!protocol) {
    sensorListDiv.innerHTML = "<p>No protocol selected.</p>";
    if (sensorDataDiv) sensorDataDiv.innerHTML = "<p>No sensor data available.</p>";
    return;
  }

  /* ---------- sensor list ---------- */
  const sensors = sensorProtocolMap[protocol] || [];
  let listHtml = "<h4>Sensors</h4><ul>";
  sensors.forEach((s) => {
    const ok = sensorStatus[protocol][s];
    listHtml += `<li><i class="fas ${ok ? "fa-check text-success" : "fa-times text-error"}"></i> ${s}</li>`;
  });
  listHtml += "</ul>";
  sensorListDiv.innerHTML = sensors.length ? listHtml : "<p>No sensors available.</p>";

  /* ---------- sensor data ---------- */
  const data = sensorData[protocol];
  let dataHtml = "<h4>Sensor Data</h4>";
  let hasData = false;
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined && v !== "null" && v !== "") {
      // Include all valid sensor data for I2C, and specific data for ADC
      if (protocol === "I2C" || k.includes("Battery Voltage") || k.includes("Rainfall")) {
        dataHtml += `<div class="sensor-data-item"><strong>${k}:</strong> ${v}</div>`;
        hasData = true;
      }
    }
  }
  if (sensorDataDiv) sensorDataDiv.innerHTML = hasData ? dataHtml : "<p>No sensor data available.</p>";
  /* ---------- I2C-specific sensor cards ---------- */
  if (protocol === "I2C") {

    calibrationSection.style.display = "block";

    /* Temperature */
    if (currentTemperature !== null && !isNaN(parseFloat(currentTemperature))) {
      thermometerContainer.style.display = "block";
      const temp = parseFloat(currentTemperature);
      let color = temp < 18 ? "#3498db" : temp < 26 ? "#2ecc71" : temp < 32 ? "#f39c12" : "#e74c3c";
      const minT = -10, maxT = 50;
      const h = Math.min(Math.max((temp - minT) / (maxT - minT), 0), 1) * 160;

      thermometerFill.style.transition = "height .8s cubic-bezier(0.68,-0.55,0.27,1.55), y .8s cubic-bezier(0.68,-0.55,0.27,1.55)";
      thermometerBulb.style.transition = "fill .8s ease";
      thermometerContainer.style.setProperty("--glow", color);

      thermometerFill.setAttribute("y", 180 - h);
      thermometerFill.setAttribute("height", h);
      thermometerFill.setAttribute("fill", color);
      thermometerBulb.setAttribute("fill", color);

      thermometerValue.textContent = `${temp.toFixed(2)}°C`;
      thermometerContainer.classList.remove("shake");
      void thermometerContainer.offsetWidth;
      thermometerContainer.classList.add("shake");
    }

    /* Humidity */
    if (currentHumidity !== null && !isNaN(parseFloat(currentHumidity))) {
      humidityCard.style.display = "block";
      const humidity = parseFloat(currentHumidity);
      humidityValue.textContent = `${humidity.toFixed(2)}%`;

      // Color interpolation based on humidity
      const t = Math.min(Math.max(humidity / 100, 0), 1);
      const lowColor = { r: 61, g: 142, b: 180 };
      const highColor = { r: 4, g: 116, b: 168 };
      const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
      const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
      const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
      const primaryColor = `rgb(${r}, ${g}, ${b})`;

      waveColor1.setAttribute("style", `stop-color: ${primaryColor}; stop-opacity: 0.5`);
      waveColor2.setAttribute("style", `stop-color: ${primaryColor}; stop-opacity: 1`);

      // Define continuous wave animation
      const waveAnimation = `
    @keyframes waveAnimation {
      0% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
      25% { d: path("M 0 50 Q 25 55 50 50 T 100 50 V 100 H 0 Z"); }
      50% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
      75% { d: path("M 0 50 Q 25 55 50 50 T 100 50 V 100 H 0 Z"); }
      100% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
    }
  `;

      // Insert or update the animation in the stylesheet
      let styleSheet = document.styleSheets[0];
      let existingRuleIndex = -1;
      for (let i = 0; i < styleSheet.cssRules.length; i++) {
        if (styleSheet.cssRules[i].name === "waveAnimation") {
          existingRuleIndex = i;
          break;
        }
      }
      if (existingRuleIndex !== -1) {
        styleSheet.deleteRule(existingRuleIndex);
      }
      styleSheet.insertRule(waveAnimation, styleSheet.cssRules.length);

      // Set wave height based on humidity
      const waveHeight = 100 - humidity;
      wavePath.setAttribute("d", `M 0 ${waveHeight} Q 25 ${waveHeight + 5} 50 ${waveHeight} T 100 ${waveHeight} V 100 H 0 Z`);

      // Apply and restart animation
      wavePath.style.animation = "waveAnimation 3s ease-in-out infinite";
      wavePath.style.animationPlayState = "running";
      wavePath.getBoundingClientRect(); // Force reflow to restart animation
    } else {
      humidityCard.style.display = "none";
      humidityValue.textContent = "";
      waveColor1.setAttribute("style", `stop-color: #3d8eb4; stop-opacity: 0.5`);
      waveColor2.setAttribute("style", `stop-color: #0474a8; stop-opacity: 1`);
      wavePath.setAttribute("d", "M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z");

      // Apply continuous animation even when no data
      const waveAnimation = `
    @keyframes waveAnimation {
      0% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
      25% { d: path("M 0 50 Q 25 55 50 50 T 100 50 V 100 H 0 Z"); }
      50% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
      75% { d: path("M 0 50 Q 25 55 50 50 T 100 50 V 100 H 0 Z"); }
      100% { d: path("M 0 50 Q 25 45 50 50 T 100 50 V 100 H 0 Z"); }
    }
  `;

      let styleSheet = document.styleSheets[0];
      let existingRuleIndex = -1;
      for (let i = 0; i < styleSheet.cssRules.length; i++) {
        if (styleSheet.cssRules[i].name === "waveAnimation") {
          existingRuleIndex = i;
          break;
        }
      }
      if (existingRuleIndex !== -1) {
        styleSheet.deleteRule(existingRuleIndex);
      }
      styleSheet.insertRule(waveAnimation, styleSheet.cssRules.length);

      wavePath.style.animation = "waveAnimation 3s ease-in-out infinite";
      wavePath.style.animationPlayState = "running";
      wavePath.getBoundingClientRect(); // Force reflow to restart animation
    }

    /* Pressure */
    if (currentPressure !== null && !isNaN(parseFloat(currentPressure))) {
      updatePressureCard(parseFloat(currentPressure));
    }

    /* ----------  show / update pressure card  ---------- */
    function updatePressureCard(hpa) {
      const card = document.getElementById('pressure-card');
      const topVal = document.getElementById('pressure-value');
      const midVal = document.getElementById('pressure-value-inner');
      const fill = document.getElementById('gauge-fill');

      if (hpa === null || isNaN(hpa)) {
        card.style.display = 'none';
        return;
      }

      card.style.display = 'flex';

      /* Single source of truth */
      const txt = Number(hpa).toFixed(2);
      topVal.textContent = `${txt} hPa`;
      midVal.textContent = txt;

      /* Animate the 360° arc */
      const minP = 300, maxP = 1100; // Adjusted range for better visualization
      const t = Math.min(Math.max((hpa - minP) / (maxP - minP), 0), 1);
      const circumference = 2 * Math.PI * 90; // Circle radius = 90
      fill.style.strokeDasharray = `${t * circumference} ${(1 - t) * circumference}`;

      /* Simple pulse on update */
      card.classList.remove('update-pulse');
      void card.offsetWidth;
      card.classList.add('update-pulse');
    }
    /* Light Intensity */
    if (currentLight !== null && !isNaN(parseFloat(currentLight))) {
      lightCard.style.display = "block";
      const light = parseFloat(currentLight);
      const maxLight = 120000;
      const brightness = Math.min(Math.max(light / maxLight, 0), 1);

      const sunSvg = document.getElementById("light-sun");
      const moonSvg = document.getElementById("light-moon");
      const sunCircle = document.getElementById("sun-circle");
      const sunGradient = document.getElementById("sunGradient");
      const sunGlow = document.getElementById("sunGlow");
      const moonShape = document.getElementById("moon-shape");
      const moonGradient = document.getElementById("moonGradient");
      const moonGlow = document.getElementById("moonGlow");
      const moonSparkles = document.getElementById("moon-sparkles");
      const sunRays = document.getElementById("sun-rays");

      // Toggle Sun/Moon based on light value
      if (light < 100) {
        // Show Moon
        sunSvg.style.display = "none";
        moonSvg.style.display = "block";
        // Moon color interpolation (dim to bright moonlight)
        const lowColor = { r: 230, g: 230, b: 250 }; // Lavender
        const highColor = { r: 70, g: 130, b: 180 }; // Steel Blue
        const t = light / 100; // Scale from 0 to 100 lux
        const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
        const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
        const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
        const moonColor = `rgb(${r}, ${g}, ${b})`;
        moonGradient.children[0].setAttribute("style", `stop-color:${moonColor}; stop-opacity:0.9`);
        moonGradient.children[1].setAttribute("style", `stop-color:${moonColor}; stop-opacity:0.6`);
        moonGradient.children[2].setAttribute("style", `stop-color:${moonColor}; stop-opacity:0.3`);
        moonGlow.setAttribute("stdDeviation", 4 + 2 * t); // Glow increases slightly with light
        moonSparkles.style.opacity = 0.5 + 0.5 * t; // Sparkles more visible at higher lux
      } else {
        // Show Sun
        sunSvg.style.display = "block";
        moonSvg.style.display = "none";
        // Sun color interpolation (yellow to orange-red)
        const lowColor = { r: 255, g: 235, b: 59 }; // Bright Yellow
        const highColor = { r: 255, g: 69, b: 0 }; // Orange-Red
        const t = Math.min((light - 100) / (maxLight - 100), 1); // Scale from 100 to maxLight
        const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
        const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
        const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
        const sunColor = `rgb(${r}, ${g}, ${b})`;
        sunGradient.children[0].setAttribute("style", `stop-color:${sunColor}; stop-opacity:1`);
        sunGradient.children[1].setAttribute("style", `stop-color:${sunColor}; stop-opacity:0.8`);
        sunGradient.children[2].setAttribute("style", `stop-color:${sunColor}; stop-opacity:0.4`);
        sunGlow.setAttribute("stdDeviation", 3 + 3 * brightness); // Glow increases with brightness
        sunCircle.setAttribute("r", 24 + 9 * brightness); // Sun size increases with brightness
        sunRays.style.opacity = 0.6 + 0.4 * brightness; // Rays more visible at higher brightness
        // Update ray color to darker shade based on sun color
        const rayR = Math.max(r - 50, 0); // Darken red component
        const rayG = Math.max(g - 50, 0); // Darken green component
        const rayB = Math.max(b - 50, 0); // Darken blue component
        const rayColor = `rgb(${rayR}, ${rayG}, ${rayB})`;
        const rays = sunRays.getElementsByClassName("sun-ray");
        for (let ray of rays) {
          ray.setAttribute("stroke", rayColor);
        }
      }

      lightValue.textContent = `${light.toFixed(2)} lux`;
    }
  } else if (protocol === "ADC") {

    /* Battery Voltage */
    if (sensorData.ADC["Battery Voltage"] !== undefined && !isNaN(parseFloat(sensorData.ADC["Battery Voltage"].replace(" V", "")))) {
      batteryCard.style.display = "block";
      const voltage = parseFloat(sensorData.ADC["Battery Voltage"].replace(" V", ""));
      const maxVoltage = 4.2; // 100%
      const minVoltage = 3.0; // 0%

      let percentage;
      if (voltage >= maxVoltage) {
        percentage = 100.0;
      } else if (voltage <= minVoltage) {
        percentage = 0.0;
      } else {
        percentage = ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100.0;
      }

      const fillHeight = (percentage / 100) * 66; // Max height of fill is 66 (out of 70)

      batteryFill.style.transition = "height 0.8s ease, fill 0.8s ease";
      batteryFill.setAttribute("height", fillHeight);
      batteryFill.setAttribute("y", 20 + (66 - fillHeight)); // Start from top and grow downward

      let fillColor;
      if (percentage <= 50) {
        const t = percentage / 50;
        const r = Math.round(248 + (255 - 248) * t);
        const g = Math.round(113 + (235 - 113) * t);
        const b = Math.round(113 + (59 - 113) * t);
        fillColor = `rgb(${r}, ${g}, ${b})`;
      } else {
        const t = (percentage - 50) / 50;
        const r = Math.round(255 + (52 - 255) * t);
        const g = Math.round(235 + (211 - 235) * t);
        const b = Math.round(59 + (153 - 59) * t);
        fillColor = `rgb(${r}, ${g}, ${b})`;
      }
      batteryFill.setAttribute("fill", fillColor);
      batteryCard.style.setProperty("--glow", fillColor);

      batteryValue.textContent = `${voltage.toFixed(2)} V (${percentage.toFixed(0)}%)`;
      batteryCard.classList.remove("shake");
      void batteryCard.offsetWidth;
      batteryCard.classList.add("shake");
    }

    /* 🌧️ Hourly Rainfall Card */
    if (
      sensorData.ADC["Rainfall Hourly"] !== undefined &&
      !isNaN(parseFloat(sensorData.ADC["Rainfall Hourly"].replace(" mm", "")))
    ) {
      rainGaugeHourlyCard.style.display = "block";
      const rainMm = parseFloat(sensorData.ADC["Rainfall Hourly"].replace(" mm", ""));
      rainGaugeHourlyValue.textContent = `${rainMm.toFixed(2)} mm`;

      // Dynamic color transition (light blue → deep blue)
      const maxMm = 25; // For hourly, reasonable max
      const t = Math.min(Math.max(rainMm / maxMm, 0), 1);
      const lowColor = { r: 30, g: 144, b: 255 };
      const highColor = { r: 0, g: 0, b: 139 };
      const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
      const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
      const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
      const primaryColor = `rgb(${r}, ${g}, ${b})`;
      const lightBlue = `rgb(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)})`;

      // ✅ Use an overlay div for raindrops
      let rainOverlay = document.getElementById("rain-hourly-overlay");
      if (!rainOverlay) {
        rainOverlay = document.createElement("div");
        rainOverlay.id = "rain-hourly-overlay";
        rainOverlay.style.position = "absolute";
        rainOverlay.style.inset = "0";
        rainOverlay.style.overflow = "hidden";
        rainOverlay.style.pointerEvents = "none";
        rainOverlay.style.zIndex = "1";
        rainGaugeHourlyCard.style.position = "relative";
        rainGaugeHourlyCard.appendChild(rainOverlay);
      }
      rainOverlay.innerHTML = "";

      // 🔹 Configure raindrop appearance based on rainfall intensity
      const baseDrops = 12;
      const extraDrops = Math.min(Math.floor(rainMm / 2), 40);
      const numDrops = baseDrops + extraDrops;

      const dropDuration = 2.5; // seconds
      const cardRect = rainGaugeHourlyCard.getBoundingClientRect();
      const width = cardRect.width;
      const height = cardRect.height;

      // Add CSS for animation if not already
      if (!document.getElementById("rainfall-style")) {
        const style = document.createElement("style");
        style.id = "rainfall-style";
        style.textContent = `
      @keyframes raindropFall {
        0% { transform: translateY(0); opacity: 1; }
        90% { opacity: 1; }
        100% { transform: translateY(var(--fallDistance)); opacity: 0; }
      }
    `;
        document.head.appendChild(style);
      }

      // 🔹 Create raindrops across the whole card
      for (let i = 0; i < numDrops; i++) {
        const drop = document.createElement("div");
        drop.className = "raindrop";
        const size = 4 + Math.random() * 2;
        drop.style.width = `${size}px`;
        drop.style.height = `${size * 1.6}px`;
        drop.style.background = `linear-gradient(${lightBlue}, ${primaryColor})`;
        drop.style.opacity = "0.8";
        drop.style.borderRadius = "50% / 60% 60% 40% 40%";
        drop.style.position = "absolute";

        const left = Math.random() * width;
        const startY = -Math.random() * height * 0.3;
        const fallDistance = `${height + 30}px`;
        const duration = (1.2 + Math.random() * 2).toFixed(2) + "s";
        const delay = (Math.random() * 2).toFixed(2) + "s";

        drop.style.left = `${left}px`;
        drop.style.top = `${startY}px`;
        drop.style.animation = `raindropFall ${duration} linear infinite`;
        drop.style.animationDelay = delay;
        drop.style.setProperty("--fallDistance", fallDistance);

        rainOverlay.appendChild(drop);
      }
    } else {
      rainGaugeHourlyCard.style.display = "none";
    }

    /* 🌧️ Daily Rainfall Card */
    if (
      sensorData.ADC["Rainfall Daily"] !== undefined &&
      !isNaN(parseFloat(sensorData.ADC["Rainfall Daily"].replace(" mm", "")))
    ) {
      rainGaugeDailyCard.style.display = "block";
      const rainMm = parseFloat(sensorData.ADC["Rainfall Daily"].replace(" mm", ""));
      rainGaugeDailyValue.textContent = `${rainMm.toFixed(2)} mm`;

      // Dynamic color transition (light blue → deep blue)
      const maxMm = 100; // Higher max for daily
      const t = Math.min(Math.max(rainMm / maxMm, 0), 1);
      const lowColor = { r: 30, g: 144, b: 255 };
      const highColor = { r: 0, g: 0, b: 139 };
      const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
      const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
      const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
      const primaryColor = `rgb(${r}, ${g}, ${b})`;
      const lightBlue = `rgb(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)})`;

      // ✅ Use an overlay div for raindrops
      let rainOverlay = document.getElementById("rain-daily-overlay");
      if (!rainOverlay) {
        rainOverlay = document.createElement("div");
        rainOverlay.id = "rain-daily-overlay";
        rainOverlay.style.position = "absolute";
        rainOverlay.style.inset = "0";
        rainOverlay.style.overflow = "hidden";
        rainOverlay.style.pointerEvents = "none";
        rainOverlay.style.zIndex = "1";
        rainGaugeDailyCard.style.position = "relative";
        rainGaugeDailyCard.appendChild(rainOverlay);
      }
      rainOverlay.innerHTML = "";

      // 🔹 Configure raindrop appearance based on rainfall intensity
      const baseDrops = 12;
      const extraDrops = Math.min(Math.floor(rainMm / 2), 40);
      const numDrops = baseDrops + extraDrops;

      const dropDuration = 2.5; // seconds
      const cardRect = rainGaugeDailyCard.getBoundingClientRect();
      const width = cardRect.width;
      const height = cardRect.height;

      // Add CSS for animation if not already (already checked above)

      // 🔹 Create raindrops across the whole card
      for (let i = 0; i < numDrops; i++) {
        const drop = document.createElement("div");
        drop.className = "raindrop";
        const size = 4 + Math.random() * 2;
        drop.style.width = `${size}px`;
        drop.style.height = `${size * 1.6}px`;
        drop.style.background = `linear-gradient(${lightBlue}, ${primaryColor})`;
        drop.style.opacity = "0.8";
        drop.style.borderRadius = "50% / 60% 60% 40% 40%";
        drop.style.position = "absolute";

        const left = Math.random() * width;
        const startY = -Math.random() * height * 0.3;
        const fallDistance = `${height + 30}px`;
        const duration = (1.2 + Math.random() * 2).toFixed(2) + "s";
        const delay = (Math.random() * 2).toFixed(2) + "s";

        drop.style.left = `${left}px`;
        drop.style.top = `${startY}px`;
        drop.style.animation = `raindropFall ${duration} linear infinite`;
        drop.style.animationDelay = delay;
        drop.style.setProperty("--fallDistance", fallDistance);

        rainOverlay.appendChild(drop);
      }
    } else {
      rainGaugeDailyCard.style.display = "none";
    }

    /* 🌧️ Weekly Rainfall Card */
    if (
      sensorData.ADC["Rainfall Weekly"] !== undefined &&
      !isNaN(parseFloat(sensorData.ADC["Rainfall Weekly"].replace(" mm", "")))
    ) {
      rainGaugeWeeklyCard.style.display = "block";
      const rainMm = parseFloat(sensorData.ADC["Rainfall Weekly"].replace(" mm", ""));
      rainGaugeWeeklyValue.textContent = `${rainMm.toFixed(2)} mm`;

      // Dynamic color transition (light blue → deep blue)
      const maxMm = 500; // Even higher max for weekly
      const t = Math.min(Math.max(rainMm / maxMm, 0), 1);
      const lowColor = { r: 30, g: 144, b: 255 };
      const highColor = { r: 0, g: 0, b: 139 };
      const r = Math.round(lowColor.r + (highColor.r - lowColor.r) * t);
      const g = Math.round(lowColor.g + (highColor.g - lowColor.g) * t);
      const b = Math.round(lowColor.b + (highColor.b - lowColor.b) * t);
      const primaryColor = `rgb(${r}, ${g}, ${b})`;
      const lightBlue = `rgb(${Math.min(r + 40, 255)}, ${Math.min(g + 40, 255)}, ${Math.min(b + 40, 255)})`;

      // ✅ Use an overlay div for raindrops
      let rainOverlay = document.getElementById("rain-weekly-overlay");
      if (!rainOverlay) {
        rainOverlay = document.createElement("div");
        rainOverlay.id = "rain-weekly-overlay";
        rainOverlay.style.position = "absolute";
        rainOverlay.style.inset = "0";
        rainOverlay.style.overflow = "hidden";
        rainOverlay.style.pointerEvents = "none";
        rainOverlay.style.zIndex = "1";
        rainGaugeWeeklyCard.style.position = "relative";
        rainGaugeWeeklyCard.appendChild(rainOverlay);
      }
      rainOverlay.innerHTML = "";

      // 🔹 Configure raindrop appearance based on rainfall intensity
      const baseDrops = 12;
      const extraDrops = Math.min(Math.floor(rainMm / 2), 40);
      const numDrops = baseDrops + extraDrops;

      const dropDuration = 2.5; // seconds
      const cardRect = rainGaugeWeeklyCard.getBoundingClientRect();
      const width = cardRect.width;
      const height = cardRect.height;

      // Add CSS for animation if not already (already checked above)

      // 🔹 Create raindrops across the whole card
      for (let i = 0; i < numDrops; i++) {
        const drop = document.createElement("div");
        drop.className = "raindrop";
        const size = 4 + Math.random() * 2;
        drop.style.width = `${size}px`;
        drop.style.height = `${size * 1.6}px`;
        drop.style.background = `linear-gradient(${lightBlue}, ${primaryColor})`;
        drop.style.opacity = "0.8";
        drop.style.borderRadius = "50% / 60% 60% 40% 40%";
        drop.style.position = "absolute";

        const left = Math.random() * width;
        const startY = -Math.random() * height * 0.3;
        const fallDistance = `${height + 30}px`;
        const duration = (1.2 + Math.random() * 2).toFixed(2) + "s";
        const delay = (Math.random() * 2).toFixed(2) + "s";

        drop.style.left = `${left}px`;
        drop.style.top = `${startY}px`;
        drop.style.animation = `raindropFall ${duration} linear infinite`;
        drop.style.animationDelay = delay;
        drop.style.setProperty("--fallDistance", fallDistance);

        rainOverlay.appendChild(drop);
      }
    } else {
      rainGaugeWeeklyCard.style.display = "none";
    }


    /* ☀️ Light Card Reset (unchanged) */
    if (sensorData.ADC["Light Intensity"] === undefined) {
      lightCard.style.display = "none";
      lightValue.textContent = "N/A";
      sunCircle.setAttribute("r", 20);
      glowFilter.setAttribute("stdDeviation", 5);
      sunGradient.children[0].setAttribute("style", "stop-color:#ffd700; stop-opacity:0.9");
      sunGradient.children[1].setAttribute("style", "stop-color:#ff8c00; stop-opacity:0.4");
      sunGradient.children[2].setAttribute("style", "stop-color:#ff4500; stop-opacity:0");
      lightCard.querySelector("rect").style.filter = "brightness(1)";
      sparkles.style.opacity = 0;
    }
  }
}
/* ------------------------------------------------------------------ */
/*  DATA PARSER                                                       */
/* ------------------------------------------------------------------ */
function parseSensorData(data) {
  const protocol = document.getElementById("sensor-select").value;
  if (!protocol) return;

  const lines = data.split("\n").map((line) => line.trim()).filter((line) => line);
  lines.forEach((line) => {
    // Handle calibration responses (only for I2C)
    if (protocol === "I2C") {
      if (line.startsWith("TEMP_CALIBRATION:")) {
        const val = parseFloat(line.split(":")[1].trim());
        if (!isNaN(val)) {
          document.getElementById("temp-offset").value = val;
          log(`Temperature calibration offset: ${val} °C`, "info");
        }
        return;
      } else if (line.startsWith("HUM_CALIBRATION:")) {
        const val = parseFloat(line.split(":")[1].trim());
        if (!isNaN(val)) {
          document.getElementById("hum-offset").value = val;
          log(`Humidity calibration offset: ${val} %`, "info");
        }
        return;
      } else if (line.startsWith("PRESS_CALIBRATION:")) {
        const val = parseFloat(line.split(":")[1].trim());
        if (!isNaN(val)) {
          document.getElementById("press-offset").value = val;
          log(`Pressure calibration offset: ${val} hPa`, "info");
        }
        return;
      }
    }

    // Handle individual sensor readings (e.g., "BME680 - Temperature: 26.96 °C")
    const sensorReading = line.match(/^(.+?)\s*-\s*(.+?):\s*(.+)$/);
    if (sensorReading) {
      const sensorName = sensorReading[1].trim();
      const param = sensorReading[2].trim();
      const value = sensorReading[3].trim();

      const sensors = sensorProtocolMap[protocol] || [];
      if (sensors.includes(sensorName)) {
        const ok = !(value === "null" || value === "" || isNaN(parseFloat(value.replace(/[^0-9.-]+/g, ""))));
        sensorStatus[protocol][sensorName] = ok;
        if (ok) sensorData[protocol][`${sensorName} ${param}`] = value;

        if (sensorName === "BME680") {
          if (param === "Temperature") currentTemperature = ok ? parseFloat(value.replace("°C", "").trim()) : null;
          else if (param === "Humidity") currentHumidity = ok ? parseFloat(value.replace("%", "").trim()) : null;
          else if (param === "Pressure") currentPressure = ok ? parseFloat(value.replace("hPa", "").trim()) : null;
        } else if (sensorName === "VEML7700" && param === "Light Intensity") {
          currentLight = ok ? parseFloat(value.replace("lux", "").trim()) : null;
        }
      }
      updateSensorUI();
      return;
    }

    // Handle JSON format (e.g., "Published to topic 'device/data': {...}")
    if (line.includes("Published to topic 'device/data'")) {
      // Robust extraction: find the position after the colon and take the rest as JSON string
      const colonIndex = line.indexOf(':');
      const jsonStr = colonIndex !== -1 ? line.substring(colonIndex + 1).trim() : '';
      if (jsonStr.startsWith('{')) {
        try {
          const json = JSON.parse(jsonStr);

          if (protocol === "I2C") {
            currentTemperature = json.CurrentTemperature;
            currentHumidity = json.CurrentHumidity;
            currentPressure = json.AtmPressure;
            currentLight = json.LightIntensity;

            sensorStatus.I2C.BME680 = currentTemperature !== undefined || currentHumidity !== undefined || currentPressure !== undefined;
            sensorStatus.I2C.VEML7700 = currentLight !== undefined;

            if (currentTemperature !== undefined) sensorData.I2C["BME680 Temperature"] = `${parseFloat(currentTemperature).toFixed(2)} °C`;
            if (currentHumidity !== undefined) sensorData.I2C["BME680 Humidity"] = `${parseFloat(currentHumidity).toFixed(2)} %`;
            if (currentPressure !== undefined) sensorData.I2C["BME680 Pressure"] = `${parseFloat(currentPressure).toFixed(2)} hPa`;
            if (currentLight !== undefined) sensorData.I2C["VEML7700 Light Intensity"] = `${parseFloat(currentLight).toFixed(2)} lux`;
          }

          if (protocol === "ADC") {
            if (json.BatteryVoltage !== undefined) {
              sensorStatus.ADC["Battery Voltage"] = true;
              sensorData.ADC["Battery Voltage"] = `${parseFloat(json.BatteryVoltage).toFixed(2)} V`;
            }
            if (json.RainfallHourly !== undefined || json.RainfallDaily !== undefined || json.RainfallWeekly !== undefined) {
              sensorStatus.ADC["Rain Gauge"] = true;
              if (json.RainfallHourly !== undefined) sensorData.ADC["Rainfall Hourly"] = `${(parseFloat(json.RainfallHourly) * 0.5).toFixed(2)} mm`;
              if (json.RainfallDaily !== undefined) sensorData.ADC["Rainfall Daily"] = `${(parseFloat(json.RainfallDaily) * 0.5).toFixed(2)} mm`;
              if (json.RainfallWeekly !== undefined) sensorData.ADC["Rainfall Weekly"] = `${(parseFloat(json.RainfallWeekly) * 0.5).toFixed(2)} mm`;
            }
          }
          updateSensorUI();
        } catch (e) {
          // Fallback: Use regex to extract values from malformed JSON string
          console.log("JSON parse failed, using regex fallback:", e);
          if (protocol === "ADC") {
            // Extract BatteryVoltage
            const batteryMatch = jsonStr.match(/"BatteryVoltage"\s*:\s*([\d.-]+)/);
            if (batteryMatch) {
              const voltage = parseFloat(batteryMatch[1]);
              if (!isNaN(voltage)) {
                sensorStatus.ADC["Battery Voltage"] = true;
                sensorData.ADC["Battery Voltage"] = `${voltage.toFixed(2)} V`;
              }
            }
            // Extract Rainfall values
            const rainfallMatches = jsonStr.match(/"Rainfall(?:Hourly|Daily|Weekly)"\s*:\s*([\d.-]+)/g);
            if (rainfallMatches && rainfallMatches.length > 0) {
              sensorStatus.ADC["Rain Gauge"] = true;
              // Parse each match to set Hourly, Daily, Weekly
              rainfallMatches.forEach(match => {
                const keyMatch = match.match(/"Rainfall(.*)"\s*:\s*([\d.-]+)/);
                if (keyMatch) {
                  const period = keyMatch[1];
                  const value = parseFloat(keyMatch[2]);
                  if (!isNaN(value)) {
                    const key = `Rainfall ${period}`;
                    sensorData.ADC[key] = `${(value * 0.5).toFixed(2)} mm`;
                  }
                }
              });
            }
          } else if (protocol === "I2C") {
            // Extract I2C values with regex if needed
            const tempMatch = jsonStr.match(/"CurrentTemperature"\s*:\s*([\d.-]+)/);
            if (tempMatch) currentTemperature = parseFloat(tempMatch[1]);
            const humMatch = jsonStr.match(/"CurrentHumidity"\s*:\s*([\d.-]+)/);
            if (humMatch) currentHumidity = parseFloat(humMatch[1]);
            const pressMatch = jsonStr.match(/"AtmPressure"\s*:\s*([\d.-]+)/);
            if (pressMatch) currentPressure = parseFloat(pressMatch[1]);
            const lightMatch = jsonStr.match(/"LightIntensity"\s*:\s*([\d.-]+)/);
            if (lightMatch) currentLight = parseFloat(lightMatch[1]);

            sensorStatus.I2C.BME680 = currentTemperature !== undefined || currentHumidity !== undefined || currentPressure !== undefined;
            sensorStatus.I2C.VEML7700 = currentLight !== undefined;

            if (currentTemperature !== undefined) sensorData.I2C["BME680 Temperature"] = `${parseFloat(currentTemperature).toFixed(2)} °C`;
            if (currentHumidity !== undefined) sensorData.I2C["BME680 Humidity"] = `${parseFloat(currentHumidity).toFixed(2)} %`;
            if (currentPressure !== undefined) sensorData.I2C["BME680 Pressure"] = `${parseFloat(currentPressure).toFixed(2)} hPa`;
            if (currentLight !== undefined) sensorData.I2C["VEML7700 Light Intensity"] = `${parseFloat(currentLight).toFixed(2)} lux`;
          }
          updateSensorUI();
        }
        return;
      }
    }

    // Handle rain gauge data (e.g., "Rain Tip Detected! Hourly: 1 Daily: 2 Weekly: 3")
    const rainMatch = line.match(/^Rain Tip Detected!\s*Hourly:\s*(\d+)\s*Daily:\s*(\d+)\s*Weekly:\s*(\d+)/);
    if (rainMatch && protocol === "ADC") {
      sensorStatus[protocol]["Rain Gauge"] = true;
      const hourlyTips = parseInt(rainMatch[1]);
      const dailyTips = parseInt(rainMatch[2]);
      const weeklyTips = parseInt(rainMatch[3]);
      sensorData[protocol]["Rainfall Hourly"] = `${(hourlyTips * 0.5).toFixed(2)} mm`;
      sensorData[protocol]["Rainfall Daily"] = `${(dailyTips * 0.5).toFixed(2)} mm`; // Store as mm
      sensorData[protocol]["Rainfall Weekly"] = `${(weeklyTips * 0.5).toFixed(2)} mm`;
      updateSensorUI();
    }
    // Handle simple key-value format (e.g., "Battery Voltage: 3.79 V")
    const batteryMatch = line.match(/^Battery Voltage:\s*([\d.]+)\s*V$/);
    if (batteryMatch && protocol === "ADC") {
      const voltage = parseFloat(batteryMatch[1]);
      sensorStatus[protocol]["Battery Voltage"] = true;
      sensorData[protocol]["Battery Voltage"] = `${voltage.toFixed(2)} V`;
      updateSensorUI();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  WEATHER STATION PROTOCOL UI                                       */
/* ------------------------------------------------------------------ */
function updateProtocolUI() {
  const p = document.getElementById("protocol-select")?.value;
  if (!p) return;

  document.getElementById("mqtt-section").style.display = p === "MQTT" ? "block" : "none";
  document.getElementById("http-section").style.display = p === "HTTP" ? "block" : "none";
  if (p === "MQTT") toggleCertUploadAndPort();
  else document.getElementById("weather-cert-upload-button").style.display = "none";
}

// function toggleCertUploadAndPort() {
//   const ssl = document.getElementById("mqtt-ssl")?.value;
//   if (!ssl) return;
//   const certSection = document.getElementById("cert-section");
//   const uploadButton = document.getElementById("weather-cert-upload-button");
//   const portInput = document.getElementById("mqtt-port");

//   if (certSection) certSection.style.display = ssl === "yes" ? "block" : "none";
//   if (uploadButton) uploadButton.style.display = ssl === "yes" ? "block" : "none";
//   if (portInput) portInput.value = ssl === "yes" ? "8883" : "1883";
// }

/* ------------------------------------------------------------------ */
/*  GATEWAY FUNCTIONS                                                 */
/* ------------------------------------------------------------------ */
function updateGatewayProtocolUI() {
  const protocol = document.getElementById("gateway-protocol-select")?.value;
  if (!protocol) return;
  document.getElementById("gateway-mqtt-section").style.display = protocol === "MQTT" ? "block" : "none";
  document.getElementById("gateway-http-section").style.display = protocol === "HTTP" ? "block" : "none";
}

// function toggleGatewayCertUploadAndPort() {
//   const ssl = document.getElementById("gateway-mqtt-ssl")?.value;
//   if (!ssl) return;
//   const certSection = document.getElementById("gateway-cert-section");
//   const uploadButton = document.getElementById("gateway-cert-upload-button");
//   const portInput = document.getElementById("gateway-mqtt-port");

//   if (certSection) certSection.style.display = ssl === "yes" ? "block" : "none";
//   if (uploadButton) uploadButton.style.display = ssl === "yes" ? "block" : "none";
//   if (portInput) portInput.value = ssl === "yes" ? "8883" : "1883";
// }


// Individual certificate uploads - Weather Station (matching Gateway style)
async function uploadWeatherCACert() {
  if (!weatherCACert) {
    log("Please select Root CA Certificate first", "error");
    return;
  }
  const result = await window.electronAPI.readFileAsText(weatherCACert);
  if (result.error || result.length > 2000) {
    log(result.error || "CA too large", "error");
    return;
  }
  const res = await window.electronAPI.sendData(`SET_CA_CERT:${result}\r\n`);
  log(res.error ? "CA upload failed" : "Root CA uploaded", res.error ? "error" : "success");
  if (!res.error) {
    document.getElementById("mqtt-ca-cert-path").value = "";
    weatherCACert = null;
  }
}

async function uploadWeatherDeviceCert() {
  if (!weatherDeviceCert) {
    log("Please select Device Certificate first", "error");
    return;
  }
  const result = await window.electronAPI.readFileAsText(weatherDeviceCert);
  if (result.error || result.length > 2000) {
    log(result.error || "Device cert too large", "error");
    return;
  }
  const res = await window.electronAPI.sendData(`SET_DEVICE_CERT:${result}\r\n`);
  log(res.error ? "Device cert failed" : "Device cert uploaded", res.error ? "error" : "success");
  if (!res.error) {
    document.getElementById("mqtt-device-cert-path").value = "";
    weatherDeviceCert = null;
  }
}

async function uploadWeatherPrivateKey() {
  if (!weatherPrivateKey) {
    log("Please select Private Key first", "error");
    return;
  }
  const result = await window.electronAPI.readFileAsText(weatherPrivateKey);
  if (result.error || result.length > 2000) {
    log(result.error || "Private key too large", "error");
    return;
  }
  const res = await window.electronAPI.sendData(`SET_PRIVATE_KEY:${result}\r\n`);
  log(res.error ? "Private key failed" : "Private key uploaded", res.error ? "error" : "success");
  if (!res.error) {
    document.getElementById("mqtt-private-key-path").value = "";
    weatherPrivateKey = null;
  }
}


/* ------------------------------------------------------------------ */
/*  CERTIFICATE BROWSING & UPLOAD - WEATHER STATION                   */
/* ------------------------------------------------------------------ */
async function browseWeatherCACert() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    weatherCACert = path;
    document.getElementById("mqtt-ca-cert-path").value = path;
    log("CA Certificate selected", "success");
  }
}

async function browseWeatherDeviceCert() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    weatherDeviceCert = path;
    document.getElementById("mqtt-device-cert-path").value = path;
    log("Device Certificate selected", "success");
  }
}

async function browseWeatherPrivateKey() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    weatherPrivateKey = path;
    document.getElementById("mqtt-private-key-path").value = path;
    log("Private Key selected", "success");
  }
}

async function uploadWeatherCertificates() {
  if (!weatherCACert || !weatherDeviceCert || !weatherPrivateKey) {
    log("Please select all three files (CA, Device Cert, Private Key)", "error");
    return;
  }

  log("Uploading certificates as text (firmware expects direct text)...", "info");

  // Upload CA Cert
  let result = await window.electronAPI.readFileAsText(weatherCACert);
  if (result.error) return log(`CA Cert read error: ${result.error}`, "error");
  if (result.length > 2000) return log("CA Cert too large (>2048 bytes approx)", "error");
  let res = await window.electronAPI.sendData(`SET_CA_CERT:${result}`);
  log(res.error ? "CA Cert failed" : "CA Cert uploaded", res.error ? "error" : "success");

  await delay(1000);

  // Upload Device Cert
  result = await window.electronAPI.readFileAsText(weatherDeviceCert);
  if (result.error) return log(`Device Cert read error: ${result.error}`, "error");
  if (result.length > 2000) return log("Device Cert too large", "error");
  res = await window.electronAPI.sendData(`SET_DEVICE_CERT:${result}`);
  log(res.error ? "Device Cert failed" : "Device Cert uploaded", res.error ? "error" : "success");

  await delay(1000);

  // Upload Private Key
  result = await window.electronAPI.readFileAsText(weatherPrivateKey);
  if (result.error) return log(`Private Key read error: ${result.error}`, "error");
  if (result.length > 2000) return log("Private Key too large", "error");
  res = await window.electronAPI.sendData(`SET_PRIVATE_KEY:${result}`);
  log(res.error ? "Private Key failed" : "Private Key uploaded", res.error ? "error" : "success");

  log("All certificates processed. Use 'GET' to verify.", "info");
}

/* ------------------------------------------------------------------ */
/*  CERTIFICATE BROWSING & UPLOAD - GATEWAY                           */
/* ------------------------------------------------------------------ */
async function browseGatewayCACert() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    gatewayCACert = path;
    document.getElementById("gateway-ca-cert-path").value = path;
    gatewayLog("CA Certificate selected", "success");
  }
}

async function browseGatewayDeviceCert() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    gatewayDeviceCert = path;
    document.getElementById("gateway-device-cert-path").value = path;
    gatewayLog("Device Certificate selected", "success");
  }
}

async function browseGatewayPrivateKey() {
  const path = await window.electronAPI.openFileDialog();
  if (path) {
    gatewayPrivateKey = path;
    document.getElementById("gateway-private-key-path").value = path;
    gatewayLog("Private Key selected", "success");
  }
}

async function uploadGatewayCertificates() {
  if (!gatewayCACert || !gatewayDeviceCert || !gatewayPrivateKey) {
    gatewayLog("Please select all three files (CA, Device Cert, Private Key)", "error");
    return;
  }

  gatewayLog("Uploading certificates as text (firmware compatible)...", "info");

  // Upload CA Cert
  let result = await window.electronAPI.readFileAsText(gatewayCACert);  // ← Fixed: use gatewayCACert
  if (result.error) {
    gatewayLog(`CA Cert read error: ${result.error}`, "error");
    return;
  }
  if (result.length > 2000) {
    gatewayLog("CA Cert too large (>2048 bytes approx)", "error");
    return;
  }
  let res = await window.electronAPI.sendData(`SET_CA_CERT:${result}`);
  gatewayLog(res.error ? "CA Cert failed" : "Root CA certificate saved", res.error ? "error" : "success");
  await delay(1000);

  // Upload Device Cert
  result = await window.electronAPI.readFileAsText(gatewayDeviceCert);  // ← Fixed
  if (result.error) {
    gatewayLog(`Device Cert read error: ${result.error}`, "error");
    return;
  }
  if (result.length > 2000) {
    gatewayLog("Device Cert too large", "error");
    return;
  }
  res = await window.electronAPI.sendData(`SET_DEVICE_CERT:${result}`);
  gatewayLog(res.error ? "Device Cert failed" : "Device certificate saved", res.error ? "error" : "success");
  await delay(1000);

  // Upload Private Key
  result = await window.electronAPI.readFileAsText(gatewayPrivateKey);  // ← Fixed
  if (result.error) {
    gatewayLog(`Private Key read error: ${result.error}`, "error");
    return;
  }
  if (result.length > 2000) {
    gatewayLog("Private Key too large", "error");
    return;
  }
  res = await window.electronAPI.sendData(`SET_PRIVATE_KEY:${result}`);
  gatewayLog(res.error ? "Private Key failed" : "Private key saved", res.error ? "error" : "success");

  gatewayLog("All certificates uploaded successfully. Send 'GET' to verify.", "success");
}

/* ------------------------------------------------------------------ */
/*  GATEWAY COMMAND FUNCTIONS                                         */
/* ------------------------------------------------------------------ */


function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

async function setGatewayID() {
  const idInput = document.getElementById("gateway-id");
  if (!idInput) {
    gatewayLog("Gateway ID input field not found!", "error");
    return;
  }

  const raw = idInput.value.trim();
  const id = parseInt(raw, 10);

  if (isNaN(id) || id <= 0 || id >= 10000) {
    gatewayLog("Gateway ID must be a number between 1 and 9999", "error");
    idInput.focus();
    return;
  }

  const command = `SET_GATEWAY_ID:${id}`;

  gatewayLog(`Sending: ${command}`, "info");

  try {
    // Small delay to help device catch up
    await new Promise(r => setTimeout(r, 300));

    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      gatewayLog(`Send failed: ${res.error}`, "error");
      return;
    }

    gatewayLog(`Command sent successfully → waiting for confirmation...`, "success");

    // Auto-verify with GET after a short delay
    await new Promise(r => setTimeout(r, 1000));
    gatewayLog("Automatically sending GET to verify...", "info");
    await window.electronAPI.sendData("GET\r\n");

  } catch (err) {
    gatewayLog(`Error sending command: ${err.message}`, "error");
  }
}

async function setAWSEndpoint() {
  const endpointInput = document.getElementById("aws-endpoint");
  if (!endpointInput) {
    gatewayLog("AWS Endpoint input field not found!", "error");
    return;
  }

  const rawEndpoint = endpointInput.value.trim();

  if (!rawEndpoint) {
    gatewayLog("Please enter an AWS Endpoint (e.g., my.endpoint.iot.us-east-1.amazonaws.com)", "error");
    endpointInput.focus();
    return;
  }

  // Basic validation - AWS IoT endpoints usually look like this
  if (!rawEndpoint.includes(".iot.") || !rawEndpoint.endsWith(".amazonaws.com")) {
    gatewayLog("Warning: Endpoint doesn't look like a valid AWS IoT endpoint. Proceed anyway?", "info");
  }

  const command = `SET_AWS_ENDPOINT:${rawEndpoint}`;

  gatewayLog(`Sending: ${command}`, "info");

  try {
    // Small delay to help device catch up
    await new Promise(r => setTimeout(r, 300));

    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      gatewayLog(`Send failed: ${res.error}`, "error");
      return;
    }

    gatewayLog(`AWS Endpoint command sent successfully → waiting for confirmation...`, "success");

    // Auto-verify with GET after delay
    await new Promise(r => setTimeout(r, 1000));
    gatewayLog("Automatically sending GET to verify current AWS Endpoint...", "info");
    await window.electronAPI.sendData("GET\r\n");

  } catch (err) {
    gatewayLog(`Error sending command: ${err.message}`, "error");
  }
}

// ================================
// SINGLE FILE UPLOAD FUNCTIONS (Gateway)
// ================================

async function uploadGatewayCACert() {
  if (!gatewayCACert) {
    gatewayLog("Please select Root CA Certificate file first", "error");
    return;
  }

  gatewayLog("Uploading Root CA Certificate...", "info");

  try {
    const result = await window.electronAPI.readFileAsText(gatewayCACert);
    if (result.error) {
      gatewayLog(`CA read error: ${result.error}`, "error");
      return;
    }

    if (result.length > 2000) {
      gatewayLog("CA Certificate too large (>2048 bytes)", "error");
      return;
    }

    const res = await window.electronAPI.sendData(`SET_CA_CERT:${result}\r\n`);
    if (res?.error) {
      gatewayLog(`CA upload failed: ${res.error}`, "error");
    } else {
      gatewayLog("Root CA Certificate uploaded successfully", "success");
      // Optional: clear path after success
      document.getElementById("gateway-ca-cert-path").value = "";
      gatewayCACert = null;
    }
  } catch (err) {
    gatewayLog(`CA upload error: ${err.message}`, "error");
  }
}

async function uploadGatewayDeviceCert() {
  if (!gatewayDeviceCert) {
    gatewayLog("Please select Device Certificate file first", "error");
    return;
  }

  gatewayLog("Uploading Device Certificate...", "info");

  try {
    const result = await window.electronAPI.readFileAsText(gatewayDeviceCert);
    if (result.error) {
      gatewayLog(`Device cert read error: ${result.error}`, "error");
      return;
    }

    if (result.length > 2000) {
      gatewayLog("Device Certificate too large (>2048 bytes)", "error");
      return;
    }

    const res = await window.electronAPI.sendData(`SET_DEVICE_CERT:${result}\r\n`);
    if (res?.error) {
      gatewayLog(`Device cert upload failed: ${res.error}`, "error");
    } else {
      gatewayLog("Device Certificate uploaded successfully", "success");
      document.getElementById("gateway-device-cert-path").value = "";
      gatewayDeviceCert = null;
    }
  } catch (err) {
    gatewayLog(`Device cert upload error: ${err.message}`, "error");
  }
}

async function uploadGatewayPrivateKey() {
  if (!gatewayPrivateKey) {
    gatewayLog("Please select Private Key file first", "error");
    return;
  }

  gatewayLog("Uploading Private Key...", "info");

  try {
    const result = await window.electronAPI.readFileAsText(gatewayPrivateKey);
    if (result.error) {
      gatewayLog(`Private key read error: ${result.error}`, "error");
      return;
    }

    if (result.length > 2000) {
      gatewayLog("Private Key too large (>2048 bytes)", "error");
      return;
    }

    const res = await window.electronAPI.sendData(`SET_PRIVATE_KEY:${result}\r\n`);
    if (res?.error) {
      gatewayLog(`Private key upload failed: ${res.error}`, "error");
    } else {
      gatewayLog("Private Key uploaded successfully", "success");
      document.getElementById("gateway-private-key-path").value = "";
      gatewayPrivateKey = null;
    }
  } catch (err) {
    gatewayLog(`Private key upload error: ${err.message}`, "error");
  }
}
async function getGatewayInterval() {
  gatewayLog("Current Gateway interval: 60 seconds (example)", "info");
}

async function setGatewayProtocol() {
  const protocol = document.getElementById("gateway-protocol-select")?.value;
  gatewayLog(`Messaging protocol set to ${protocol}`, "success");
}


async function getGatewayMQTTConfig() {
  gatewayLog("Fetched current Gateway MQTT config", "info");
}

async function setGatewayHTTPConfig() {
  gatewayLog("Gateway HTTP configuration saved", "success");
}

async function getGatewayHTTPConfig() {
  gatewayLog("Fetched current Gateway HTTP config", "info");
}

function clearGatewayOutput() {
  const el = document.getElementById("gateway-output");
  if (el) el.innerHTML = '';
}


// Navigation
function showSection(section) {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('weather-section').style.display = section === 'weather' ? 'flex' : 'none';
  document.getElementById('gateway-section').style.display = section === 'gateway' ? 'flex' : 'none';
  document.getElementById('back-nav-button').style.display = 'block';
}

function showHome() {
  document.getElementById('home-screen').style.display = 'flex';
  document.getElementById('weather-section').style.display = 'none';
  document.getElementById('gateway-section').style.display = 'none';
  document.getElementById('back-nav-button').style.display = 'none';
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  const icon = document.querySelector('.theme-toggle i');
  icon.className = document.body.classList.contains('dark-mode') ? 'fas fa-sun' : 'fas fa-moon';
}

if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark-mode');
  document.querySelector('.theme-toggle i').className = 'fas fa-sun';
}

document.querySelectorAll('.collapsible').forEach(button => {
  button.addEventListener('click', function () {
    this.classList.toggle('active');
    const content = this.nextElementSibling;
    content.classList.toggle('active');
  });
});

function updateGatewayProtocolUI() {
  const protocol = document.getElementById('gateway-protocol-select').value;
  document.getElementById('gateway-mqtt-section').style.display = protocol === 'MQTT' ? 'block' : 'none';
  document.getElementById('gateway-http-section').style.display = protocol === 'HTTP' ? 'block' : 'none';
}

async function setGatewayPublishTopic() {
  console.log("*** setGatewayPublishTopic ACTIVE! ***");

  const topicInput = document.getElementById("gateway-mqtt-publish-topic");
  if (!topicInput) {
    gatewayLog("Publish Topic input field not found!", "error");
    return;
  }

  const topic = topicInput.value.trim();

  if (!topic) {
    gatewayLog("Publish topic cannot be empty", "error");
    topicInput.focus();
    return;
  }

  // Firmware expects: SET_PUBLISH_TOPIC:gateway/data/7
  // So we send exactly that format
  const command = `SET_PUBLISH_TOPIC:${topic}`;

  gatewayLog(`Sending: "${command}"`, "info");

  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Send command with \r\n as firmware expects
    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      gatewayLog(`Send failed: ${res.error}`, "error");
      return;
    }

    gatewayLog(`Command sent successfully → waiting for confirmation...`, "success");

    // Auto-verify with GET after delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    gatewayLog("Automatically sending GET to verify...", "info");
    await window.electronAPI.sendData("GET\r\n");

  } catch (err) {
    gatewayLog(`Error sending command: ${err.message}`, "error");
  }
}

async function getGatewayConfig() {
  gatewayLog("Sending GET command...", "info");
  const res = await window.electronAPI.sendData("GET");

  if (res.error) {
    gatewayLog(`GET command failed: ${res.error}`, "error");
  } else {
    gatewayLog("GET command sent → check UART logs for full configuration", "success");
  }
}
// Placeholder Gateway functions (move to renderer.js later if needed)

async function applyBlePayload() {
  const input = document.getElementById("ble-payload");
  if (!input) {
    gatewayLog("BLE Payload input field not found!", "error");
    return;
  }

  const value = parseInt(input.value.trim(), 10);

  if (isNaN(value)) {
    gatewayLog("Please enter a valid number", "error");
    input.focus();
    return;
  }

  if (value < 16 || value > 256) {
    gatewayLog("BLE Payload Size must be between 16 and 256 bytes", "error");
    input.focus();
    return;
  }

  if (!isPowerOfTwo(value)) {
    gatewayLog("BLE Payload Size must be a power of 2 (16, 32, 64, 128, 256)", "error");
    input.focus();
    return;
  }

  const command = `SET_BLE_PAYLOAD:${value}`;

  gatewayLog(`Sending: ${command}`, "info");

  try {
    await new Promise(r => setTimeout(r, 300));

    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      gatewayLog(`Failed to set BLE Payload: ${res.error}`, "error");
    } else {
      gatewayLog(`BLE Payload Size set to ${value} bytes`, "success");

      await new Promise(r => setTimeout(r, 1000));
      gatewayLog("Sending GET to verify...", "info");
      await window.electronAPI.sendData("GET\r\n");
    }
  } catch (err) {
    gatewayLog(`Error: ${err.message}`, "error");
  }
}

async function applyUploadPayload() {
  const input = document.getElementById("upload-payload");
  if (!input) {
    gatewayLog("Upload Payload input field not found!", "error");
    return;
  }

  const value = parseInt(input.value.trim(), 10);

  if (isNaN(value)) {
    gatewayLog("Please enter a valid number", "error");
    input.focus();
    return;
  }

  if (value < 256 || value > 4096) {
    gatewayLog("Upload Payload Size must be between 256 and 4096 bytes", "error");
    input.focus();
    return;
  }

  if (!isPowerOfTwo(value)) {
    gatewayLog("Upload Payload Size must be a power of 2 (256, 512, 1024, 2048, 4096)", "error");
    input.focus();
    return;
  }

  const command = `SET_UPLOAD_SIZE:${value}`;

  gatewayLog(`Sending: ${command}`, "info");

  try {
    await new Promise(r => setTimeout(r, 300));

    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      gatewayLog(`Failed to set Upload Payload Size: ${res.error}`, "error");
    } else {
      gatewayLog(`Cloud Upload Payload Size set to ${value} bytes`, "success");

      await new Promise(r => setTimeout(r, 1000));
      gatewayLog("Sending GET to verify...", "info");
      await window.electronAPI.sendData("GET\r\n");
    }
  } catch (err) {
    gatewayLog(`Error: ${err.message}`, "error");
  }
}


function setGatewayProtocol() { gatewayLog("Messaging protocol updated.", "success"); }
function getGatewayMQTTConfig() { gatewayLog("Fetched MQTT Config.", "info"); }
function setGatewayHTTPConfig() { gatewayLog("HTTP Config saved.", "success"); }
function getGatewayHTTPConfig() { gatewayLog("Fetched HTTP Config.", "info"); }

function clearGatewayOutput() {
  document.getElementById('gateway-output').innerHTML = '';
}


// Show/hide sensor payload input when type is selected
function toggleSensorPayloadInput() {
  const type = document.getElementById("gateway-sensor-type").value;
  const container = document.getElementById("sensor-payload-container");
  const list = document.getElementById("gateway-sensor-list");

  if (type) {
    container.style.display = "block";
    list.innerHTML = ""; // Clear previous

    // Auto-suggest common values
    const input = document.getElementById("sensor-payload-bytes");
    if (type === "accelerometer") {
      input.placeholder = "Recommended: 6 bytes (X,Y,Z)";
    } else if (type === "temp-humidity") {
      input.placeholder = "Recommended: 4 bytes (Temp + Hum)";
    } else {
      input.placeholder = "Enter even number (2, 4, 6...)";
    }
  } else {
    container.style.display = "none";
    list.innerHTML = '<p style="color: #888; font-style: italic;">Select a sensor type to configure payload.</p>';
  }
}



// Apply Gateway Total Payload
function applyGatewayPayload() {
  const bytes = parseInt(document.getElementById("gateway-total-payload").value);

  if (isNaN(bytes) || bytes < 2 || bytes % 2 !== 0) {
    gatewayLog("Gateway payload must be an even number ≥ 2", "error");
    return;
  }

  gatewayLog(`Gateway total payload set to ${bytes} bytes`, "success");
  // Future: send command like SET_GATEWAY_PAYLOAD:${bytes}
}

// Initialize
toggleSensorPayloadInput();
// Weather Station functions (minimal inline)
async function restartDevice() {
  const res = await window.electronAPI.sendData('RESTART');
  const output = document.getElementById('output');
  if (res.error) {
    output.innerHTML += `<span class="log-line log-error">Failed to send RESTART command: ${res.error}</span><br>`;
  } else {
    output.innerHTML += `<span class="log-line log-success">Sent RESTART command to device.</span><br>`;
  }
  output.scrollTop = output.scrollHeight;
  const button = document.getElementById('restart-button');
  button.disabled = true;
  setTimeout(() => button.disabled = false, 5000);
}

function clearOutput() {
  document.getElementById('output').innerHTML = '';
}

function updateIntervalDisplay() {
  const input = document.getElementById('interval');
  if (input) input.value = input.value.replace(/[^0-9]/g, '');
}

async function setInterval() {  // Weather
  const v = parseInt(document.getElementById("interval").value);
  if (isNaN(v) || v <= 0) return log("Invalid interval", "error");
  const res = await window.electronAPI.sendData(`SET_INTERVAL:${v}`);
  log(res.error ? res.error : "Interval set", res.error ? "error" : "success");
}

function log(message, type = "default") {
  const output = document.getElementById('output');
  if (!output) return;

  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Just raw message – no time, no prefix, no class
  output.innerHTML += `<span class="log-raw">${escaped}</span><br>`;
  output.scrollTop = output.scrollHeight;

  console.log(`[WEATHER] ${message}`);
}


/* ------------------------------------------------------------------ */
/* GATEWAY SERIAL PORT FUNCTIONS */
/* ------------------------------------------------------------------ */

async function listPortsGateway() {
  const res = await window.electronAPI.listPorts();  // Reuse listPorts
  const sel = document.getElementById("gateway-ports");
  if (!sel) return;

  sel.innerHTML = '<option value="">Select a port</option>';
  if (res.error) {
    gatewayLog(res.error, "error");
    return;
  }
  res.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
  gatewayLog("Available ports refreshed", "info");
}

async function connectGatewayPort() {
  const port = document.getElementById("gateway-ports").value;
  const baud = parseInt(document.getElementById("gateway-baud-rate").value);

  if (!port) {
    gatewayLog("Please select a port.", "error");
    return;
  }

  const res = await window.electronAPI.connectGatewayPort(port, baud);  // Fixed: use connectGatewayPort
  if (res.error) {
    gatewayLog(`Connection failed: ${res.error}`, "error");
  } else {
    gatewayLog(`Gateway connected to ${port} at ${baud} baud`, "success");
    isGatewayConnected = true;
    currentGatewayPort = port;
    currentGatewayBaud = baud;
    document.querySelectorAll('#gateway-section .action-button').forEach(btn => btn.disabled = false);
  }
}

async function disconnectGatewayPort() {
  if (!isGatewayConnected && !currentGatewayPort) {
    gatewayLog("No active Gateway connection.", "info");
    return;
  }

  const res = await window.electronAPI.disconnectGatewayPort();  // Fixed: use disconnectGatewayPort
  if (res.error) {
    gatewayLog(`Disconnect failed: ${res.error}`, "error");
  } else {
    gatewayLog("Gateway disconnected from serial port", "success");
    isGatewayConnected = false;
    currentGatewayPort = "";
    currentGatewayBaud = 115200;
  }
}

async function setGatewayInterval() {
  const v = parseInt(document.getElementById("gateway-interval").value);
  if (isNaN(v) || v <= 0) {
    gatewayLog("Invalid interval - must be a positive number", "error");
    return;
  }
  const res = await window.electronAPI.sendData(`SET_INTERVAL:${v}`);
  if (res.error) {
    gatewayLog(res.error, "error");
  } else {
    gatewayLog(`Interval set to ${v} seconds`, "success");
  }
}
async function getGatewayInterval() {
  const res = await window.electronAPI.sendData("GET");  // Firmware uses GET for all, including interval
  gatewayLog(res.error ? res.error : "Fetched current config (including interval)", res.error ? "error" : "success");
}

// Add near other gateway functions
async function setGatewayBLEAddress() {
  const addressInput = document.getElementById("gateway-ble-address");
  const bleAddr = addressInput?.value?.trim().toUpperCase();

  if (!bleAddr) {
    gatewayLog("Please enter BLE address", "error");
    return;
  }

  // Basic format validation (AA:BB:CC:DD:EE:FF)
  const macRegex = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
  if (!macRegex.test(bleAddr)) {
    gatewayLog("Invalid BLE address format. Use format: AA:BB:CC:DD:EE:FF", "error");
    return;
  }

  gatewayLog(`Setting BLE address → ${bleAddr} ...`, "info");

  const command = `SET_BLE:${bleAddr}`;
  const res = await window.electronAPI.sendData(command);

  if (res.error) {
    gatewayLog(`Failed to set BLE address: ${res.error}`, "error");
  } else {
    gatewayLog(`BLE address successfully set to: ${bleAddr}`, "success");
    // Optional: keep the value in input field
    addressInput.value = bleAddr;
  }
}
/* ------------------------------------------------------------------ */
/*  WEATHER STATION SERIAL & COMMANDS                                 */
/* ------------------------------------------------------------------ */
async function listPorts() {
  const res = await window.electronAPI.listPorts();
  const sel = document.getElementById("ports");
  sel.innerHTML = "";
  if (res.error) return log(res.error, "error");
  res.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
}

async function connectPort() {
  const port = document.getElementById("ports").value;
  const baud = document.getElementById("baud-rate").value;
  if (!port) return log("Please select a port.", "error");
  const res = await window.electronAPI.connectPort(port, parseInt(baud));
  if (res.error) log(res.error, "error");
  else {
    log(`Connected to ${port} at ${baud} baud`, "success");
    isConnected = true;
    currentPort = port;
    currentBaud = parseInt(baud);
  }
}

async function disconnectPort() {
  const res = await window.electronAPI.disconnectPort();
  if (res.error) log(res.error, "error");
  else {
    log("Disconnected from serial port", "success");
    isConnected = false;
    clearSensorData();
  }
}
async function getInterval() {
  if (!isConnected) {
    log("Cannot get interval: No serial port connected", "error");
    return;
  }
  try {
    const res = await window.electronAPI.getInterval();
    if (res.error) {
      log(`Failed to get interval: ${res.error}`, "error");
    } else {
      log(`Command sent: GET_INTERVAL`, "info");
    }
  } catch (err) {
    log(`Error getting interval: ${err.message}`, "error");
  }
}
async function setDeviceID() {
  const id = document.getElementById("device-id").value.trim();
  if (!id || !/^[a-zAZ0-9-_]+$/.test(id)) return log("Please enter a valid alphanumeric Device ID.", "error");
  const res = await window.electronAPI.setDeviceID(id);
  res.error ? log(res.error, "error") : log(res, "success");
}

async function setProtocol() {
  const p = document.getElementById("protocol-select").value;
  const res = await window.electronAPI.setProtocol(p);
  if (res.error) return log(res.error, "error");
  log(res, "success");
  updateProtocolUI();
}
async function setWeatherPublishTopic() {
  const topicInput = document.getElementById("weather-mqtt-publish-topic");
  if (!topicInput) {
    log("Publish Topic input field not found!", "error");
    return;
  }

  const topic = topicInput.value.trim();

  if (!topic) {
    log("Publish topic cannot be empty", "error");
    topicInput.focus();
    return;
  }

  const command = `SET_PUBLISH_TOPIC:${topic}`;
  log(`Sending: "${command}"`, "info");

  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const res = await window.electronAPI.sendData(command + "\r\n");

    if (res?.error) {
      log(`Send failed: ${res.error}`, "error");
      return;
    }

    log(`Command sent successfully → waiting for confirmation...`, "success");

    await new Promise(resolve => setTimeout(resolve, 1000));
    log("Automatically sending GET to verify...", "info");
    await window.electronAPI.sendData("GET\r\n");

  } catch (err) {
    log(`Error sending command: ${err.message}`, "error");
  }
}

/* FTP / MQTT / HTTP config functions */


async function setMQTTConfig() {
  const broker = document.getElementById("mqtt-broker").value.trim();
  const user = document.getElementById("mqtt-user").value.trim();
  const pass = document.getElementById("mqtt-password").value;
  const ssl = document.getElementById("mqtt-ssl").value;
  
  if (!broker && !user && !pass && !topic && ssl === "no") return log("Please enter at least one MQTT configuration field.", "error");
  if (broker && !/^[a-zA-Z0-9.-]+$/.test(broker)) return log("Invalid MQTT broker format.", "error");
  if (topic && !/^[a-zA-Z0-9\/_+#-]+$/.test(topic)) return log("Invalid MQTT topic format.", "error");
  const cmds = [];
  if (ssl !== "") cmds.push(`SET_MQTT_SSL:${ssl === "yes" ? "ON" : "OFF"}`);
  if (broker) cmds.push(`SET_MQTT_BROKER:${broker}`);
  if (user) cmds.push(`SET_MQTT_USER:${user}`);
  if (pass) cmds.push(`SET_MQTT_PASS:${pass}`);
  if (topic) cmds.push(`SET_PUBLISH_TOPIC:${topic}`);
  for (const c of cmds) {
    const r = await window.electronAPI.sendData(c);
    r.error ? log(r.error, "error") : log(r, "success");
    await delay(1500);
  }
  const res = await window.electronAPI.setProtocol("MQTT");
  if (res.error) return log(res.error, "error");
  log(res, "success");
  await delay(3000);
  const v = await window.electronAPI.getMQTTConfig();
  if (v.error || v.includes("MQTT not active")) log("MQTT protocol not active after setting. Please check device.", "error");
}
async function getMQTTConfig() {
  const res = await window.electronAPI.getMQTTConfig();
  res.error ? log(res.error, "error") : log(res, "success");
}

async function setHTTPConfig() {
  const url = document.getElementById("http-url").value.trim();
  const user = document.getElementById("http-auth-user").value.trim();
  const pass = document.getElementById("http-auth-password").value;
  if (!url && !user && !pass) return log("Please enter at least one HTTP configuration field.", "error");
  if (url && !/^https?:\/\/.+$/.test(url)) return log("Invalid HTTP URL format.", "error");
  const cmds = [];
  if (url) cmds.push(`SET_HTTP_URL:${url}`);
  if (user && pass) cmds.push(`SET_HTTP_AUTH:${user}:${pass}`);
  for (const c of cmds) {
    const r = await window.electronAPI.sendData(c);
    r.error ? log(r.error, "error") : log(r, "success");
    await delay(1500);
  }
  const res = await window.electronAPI.setProtocol("HTTP");
  res.error ? log(res.error, "error") : log(res, "success");
  await delay(2000);
  await window.electronAPI.getHTTPConfig();
}
async function getHTTPConfig() {
  const res = await window.electronAPI.getHTTPConfig();
  res.error ? log(res.error, "error") : log(res, "success");
}

async function uploadFile() {
  const fp = await window.electronAPI.openFileDialog();
  if (!fp) return log("No file selected for upload.", "error");
  const res = await window.electronAPI.uploadFile(fp);
  res.error ? log(res.error, "error") : log(res, "success");
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ */
/*  SERIAL DATA HANDLER                                               */
/* ------------------------------------------------------------------ */
window.electronAPI.onSerialData((data) => {
  if (data.includes("DISCONNECTED:")) {
    isConnected = false;
    clearSensorData();
  }
  if (!data) return;
  const sanitized = data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  parseSensorData(sanitized);

  if (sanitized.includes("RX Received") || sanitized.includes("Text: '") || sanitized.includes("Config saved"))
    return;

  let cls = "log-default";
  if (/error|failed|ENOENT|not active/i.test(sanitized)) cls = "log-error";
  else if (/successfully|saved ok|connected to|current interval|protocol initialized/i.test(sanitized)) cls = "log-success";
  else if (/\/usr contents|device id:|topic=/i.test(sanitized)) cls = "log-info";

  log(sanitized, cls);


  if (sanitized.startsWith("MQTT protocol") || sanitized.includes("MQTT extras")) {
    const b = sanitized.match(/broker=([^,]+)/);
    const u = sanitized.match(/user=([^,]+)/);
    const s = sanitized.match(/ssl=([^,]+)/) || sanitized.match(/ssl_enabled=([^,]+)/);
    const t = sanitized.match(/topic=([^,]+)/);
    if (b) document.getElementById("mqtt-broker").value = b[1];
    if (u) document.getElementById("mqtt-user").value = u[1];
    if (s) {
      document.getElementById("mqtt-ssl").value = /true|on/i.test(s[1]) ? "yes" : "no";
      toggleCertUploadAndPort();
    }
    if (t) document.getElementById("mqtt-topic").value = t[1];
  }
  if (sanitized.startsWith("HTTP protocol")) {
    const u = sanitized.match(/url=([^,]+)/);
    if (u) document.getElementById("http-url").value = u[1];
  }
});



/* ------------------------------------------------------------------ */
/*  Calibration Functions                                             */
/* ------------------------------------------------------------------ */


async function setTempCalibration() {
  const val = document.getElementById("temp-offset").value;
  if (isNaN(val) || val < -2 || val > 2) return log("Invalid temperature offset (-2 to 2)", "error");
  const res = await window.electronAPI.sendData(`TEMP_CALIBRATION:${val}`);
  res.error ? log(res.error, "error") : log(`Set temperature calibration to ${val} °C`, "success");
}

async function setHumCalibration() {
  const val = document.getElementById("hum-offset").value;
  if (isNaN(val) || val < -10 || val > 10) return log("Invalid humidity offset (-10 to 10)", "error");
  const res = await window.electronAPI.sendData(`HUM_CALIBRATION:${val}`);
  res.error ? log(res.error, "error") : log(`Set humidity calibration to ${val} %`, "success");
}

async function setPressCalibration() {
  const val = document.getElementById("press-offset").value;
  if (isNaN(val) || val < -10 || val > 10) return log("Invalid pressure offset (-10 to 10)", "error");
  const res = await window.electronAPI.sendData(`PRESS_CALIBRATION:${val}`);
  res.error ? log(res.error, "error") : log(`Set pressure calibration to ${val} hPa`, "success");
}

async function resetCalibration() {
  const res = await window.electronAPI.sendData("CALIBRATION_RESET");
  res.error ? log(res.error, "error") : log("Calibration reset sent", "success");
  // Reset UI inputs to 0
  document.getElementById("temp-offset").value = 0;
  document.getElementById("hum-offset").value = 0;
  document.getElementById("press-offset").value = 0;
}

/* ------------------------------------------------------------------ */
/*  INIT                                                              */
/* ------------------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  updateProtocolUI();
  listPorts();
  listPortsGateway();
  updateSensorUI();
  document.getElementById("baud-rate").addEventListener("change", async () => {
    if (isConnected) {
      const oldBaud = currentBaud;
      await disconnectPort();
      log(`Disconnected from port at ${oldBaud} baud. Please reconnect with the new baud rate.`, "info");
    }
  });
  document.getElementById("ports").addEventListener("focus", async () => {
    await listPorts();
  });
  document.getElementById("ports").addEventListener("change", async () => {
    if (isConnected) {
      const oldPort = currentPort;
      const oldBaud = currentBaud;
      await disconnectPort();
      log(`Disconnected from port ${oldPort} at ${oldBaud} baud. Please reconnect with the new port.`, "info");
    }
  });

// Gateway interval input validation
const gatewayIntervalInput = document.getElementById('gateway-interval');
if (gatewayIntervalInput) {
  gatewayIntervalInput.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '');
  });

  gatewayIntervalInput.addEventListener('keydown', function (event) {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
    if (allowedKeys.includes(event.key) || /^[0-9]$/.test(event.key)) {
      return;
    }
    event.preventDefault();
  });
}
  // Weather interval input validation
  const intervalInput = document.getElementById('interval');
  if (intervalInput) {
    intervalInput.addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '');
    });

    intervalInput.addEventListener('keydown', function (event) {
      const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
      if (allowedKeys.includes(event.key) || /^[0-9]$/.test(event.key)) {
        return;
      }
      event.preventDefault();
    });
  }
  // Confirmation message
  gatewayLog("Gateway UART listener active – logs will appear here", "info");
  // ================================================================
});

/* tiny helper */
function log(msg, type = "default") {
  const out = document.getElementById("output");
  out.innerHTML += `<span class="log-line log-${type}">${msg}</span><br>`;
  out.scrollTop = out.scrollHeight;
}
function clearSensorData() {
  sensorStatus = {
    I2C: { BME680: false, VEML7700: false },
    ADC: { "Battery Voltage": false, "Rain Gauge": false },
    RS232: { "Ultrasonic Sensor": false },
    RS485: {},
    SPI: {},
  };
  sensorData = { I2C: {}, ADC: {}, RS232: {}, RS485: {}, SPI: {} };
  currentTemperature = null;
  currentHumidity = null;
  currentPressure = null;
  currentLight = null;
  updateSensorUI();
}

/* ------------------------------------------------------------------ */
/*  INTERVAL INPUT HANDLING                                           */
/* ------------------------------------------------------------------ */
const intervalInput = document.getElementById('interval');

if (intervalInput) {
  // Ensure only numbers can be typed
  intervalInput.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '');
  });

  // On keydown, allow backspace, arrow keys, etc., and prevent invalid input
  intervalInput.addEventListener('keydown', function (event) {
    const allowedKeys = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'
    ];
    if (allowedKeys.includes(event.key) || /^[0-9]$/.test(event.key)) {
      return; // Allow these keys
    }
    event.preventDefault(); // Prevent other keys
  });
}

