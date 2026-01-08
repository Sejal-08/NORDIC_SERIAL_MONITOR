const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const { SerialPort } = require("serialport");
const fs = require("fs").promises;

let mainWindow;
let port;  // Weather station
let gatewayPort;  // Gateway
let responseBuffer = "";
let lastSentCommand = "";

async function sendCommand(message, activePort) {
  if (!activePort) {
    return { error: "No port selected" };
  }

  try {
    // Optional: small drain to clear any stale data
    if (activePort.readable && activePort.readableLength > 0) {
      while (activePort.readableLength > 0) {
        activePort.read();
      }
    }

    const command = message + "\r\n";
    const portPath = activePort.path || "unknown";
    console.log(`Sending command to ${portPath}: ${JSON.stringify(command)}`);

    const channel = activePort === gatewayPort ? "gateway-serial-data" : "serial-data";
    mainWindow.webContents.send(channel, `> ${message}`);
    lastSentCommand = message;

    await new Promise((resolve, reject) => {
      activePort.write(command, "utf8", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Small delay to let firmware process
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log(`Command sent successfully: ${message}`);
    return `Successfully sent: ${message}`;
  } catch (error) {
    console.error(`Failed to send command "${message}":`, error);
    return { error: `Failed to send data: ${error.message}` };
  }
}

/**
 * Upload a file to the device.
 */
async function sendFile(filePath, fileName) {
  if (!port || !port.isOpen) {
    return { error: "Port not open!" };
  }

  try {
    const fileContent = await fs.readFile(filePath);
    const command = `UPLOAD_FILE:${fileName}\r\n`;
    const destPath = `/usr/${fileName}`;
    lastSentCommand = `UPLOAD_FILE:${fileName}`; // For echo filtering

    // Flush UART buffer
    while (port.readable && port.readableLength > 0) {
      port.read();
    }
    console.log("Flushed UART buffer before sending UPLOAD_FILE");

    // Send the upload command
    console.log(`Sending upload command for: ${fileName} (${fileContent.length} bytes)`);
    mainWindow.webContents.send("serial-data", `> UPLOAD_FILE:${fileName}`);
    await new Promise((resolve, reject) => {
      port.write(command, (err) => (err ? reject(err) : resolve()));
    });

    // Wait before sending file data
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send the file content
    await new Promise((resolve, reject) => {
      port.write(fileContent, (err) => (err ? reject(err) : resolve()));
    });
    console.log(`Sent ${fileContent.length} bytes for ${fileName}`);

    // Send the end-of-file marker
    await new Promise((resolve, reject) => {
      port.write("END_FILE\r\n", (err) => (err ? reject(err) : resolve()));
    });
    console.log(`Sent END_FILE for ${fileName}`);
    mainWindow.webContents.send("serial-data", "> END_FILE");

    // Wait for confirmation
    const confirmation = await new Promise((resolve, reject) => {
      let responseData = "";
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout: No confirmation received for ${fileName}`));
      }, 30000);

      const dataListener = (data) => {
        const text = data.toString("utf8");
        responseData += text;
        console.log(`Received chunk during confirmation: "${text}"`);
        mainWindow.webContents.send("serial-data", text);

        if (responseData.includes(`File ${destPath} received and saved OK`)) {
          cleanup();
          resolve(`Successfully uploaded ${fileName}`);
        } else if (responseData.includes("Error")) {
          cleanup();
          reject(new Error(`Firmware error while receiving ${fileName}: ${responseData.substring(0, 200)}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        port.removeListener("data", dataListener);
      };

      port.on("data", dataListener);
    });

    return confirmation;
  } catch (error) {
    console.error(`Failed to send file "${fileName}":`, error);
    return { error: `Failed to send file ${fileName}: ${error.message}` };
  }
}

/**
 * Create Electron window.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile("index.html");
}

/**
 * App lifecycle.
 */
app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (port && port.isOpen) {
      port.close(() => console.log("Serial port closed."));
    }
    app.quit();
  }
});

/**
 * IPC handlers.
 */

// NEW: Gateway-specific connect handler
ipcMain.handle("connect-gateway-port", async (event, { portName, baudRate = 115200 }) => {
  try {
    if (gatewayPort && gatewayPort.isOpen) {
      await new Promise((resolve) => gatewayPort.close(resolve));
    }

    gatewayPort = new SerialPort({
      path: portName,
      baudRate: parseInt(baudRate),
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      gatewayPort.open((err) => (err ? reject(err) : resolve()));
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

  // In connect-gateway-port handler
gatewayPort.on("data", (data) => {
  try {
    const incomingText = data.toString("utf8");
    console.log(`[GATEWAY RX RAW from ${portName}]: "${incomingText}"`);  // <--- MUST see this in console!

    // Send to renderer - no filtering for now
    mainWindow.webContents.send("gateway-serial-data", incomingText);

    // Also log to console for debugging
    console.log(`Sent to renderer via gateway-serial-data: "${incomingText.trim()}"`);
  } catch (err) {
    console.error("Gateway serial data error:", err);
    mainWindow.webContents.send("gateway-serial-data", `Error: ${err.message}`);
  }
});

    gatewayPort.on("close", () => {
      console.log("Gateway port closed");
      mainWindow.webContents.send("gateway-serial-data", "DISCONNECTED: Gateway port closed");
    });

    gatewayPort.on("error", (err) => {
      console.error("Gateway port error:", err.message);
      mainWindow.webContents.send("gateway-serial-data", `Gateway port error: ${err.message}`);
      if (gatewayPort.isOpen) gatewayPort.close();
    });

    return `Gateway connected to ${portName} at ${baudRate} baud`;
  } catch (error) {
    console.error("Gateway connect error:", error);
    return { error: `Failed to connect gateway to ${portName}: ${error.message}` };
  }
});

ipcMain.handle("disconnect-gateway-port", async () => {
  try {
    if (gatewayPort && gatewayPort.isOpen) {
      await new Promise((resolve) => gatewayPort.close(resolve));
      return "Gateway disconnected.";
    }
    return "No gateway port to disconnect.";
  } catch (error) {
    console.error("Gateway disconnect error:", error);
    return { error: `Failed to disconnect gateway: ${error.message}` };
  }
});

// Weather Station specific commands
ipcMain.handle("weather-send-data", async (event, message) => {
  if (!port || !port.isOpen) {
    console.error("Weather port not open");
    return { error: "Weather station port not connected" };
  }
  console.log(`Weather command: ${message}`);
  return await sendCommand(message, port);
});

// Gateway specific commands
ipcMain.handle("gateway-send-data", async (event, message) => {
  if (!gatewayPort || !gatewayPort.isOpen) {
    console.error("Gateway port not open");
    return { error: "Gateway port not connected" };
  }
  console.log(`Gateway command: ${message}`);
  return await sendCommand(message, gatewayPort);
});

// Generic send-data (tries to use the most recently connected port)
ipcMain.handle("send-data", async (event, message) => {
  let activePort = null;
  let portType = "none";
  
  if (gatewayPort && gatewayPort.isOpen) {
    activePort = gatewayPort;
    portType = "gateway";
  } else if (port && port.isOpen) {
    activePort = port;
    portType = "weather";
  }
  
  if (!activePort) {
    console.error("send-data: No active serial port!");
    return { error: "No port selected" };
  }

  console.log(`send-data: Using ${portType} port`);
  return await sendCommand(message, activePort);
});


ipcMain.handle("list-ports", async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => p.path);
  } catch (error) {
    console.error("List ports error:", error);
    return { error: `Failed to list ports: ${error.message}` };
  }
});
ipcMain.handle("read-file-as-text", async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath, "utf8");
    // Remove ALL line breaks - firmware expects single-line certificate
    const singleLine = data.replace(/\r?\n/g, '');
    return singleLine;
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("connect-port", async (event, portName, baudRate = 115200) => {
  try {
    if (port && port.isOpen) {
      await new Promise((resolve) => port.close(resolve));
    }
    responseBuffer = "";
    lastSentCommand = "";

    port = new SerialPort({
      path: portName,
      baudRate: parseInt(baudRate),
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });

    // Register data listener BEFORE waiting
    port.on("data", (data) => {
      try {
        const incomingText = data.toString("utf8");
        console.log(`[WEATHER RX RAW from ${portName}]: "${incomingText}"`);

        responseBuffer += incomingText;
        let lines = responseBuffer.split(/\r?\n/);
        responseBuffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          const message = line.trim();
          // Skip firmware echoes
          if (message &&
              !message.startsWith("RX Received") &&
              !message.startsWith("Text: ")) {
            console.log(`[WEATHER] Processed: "${message}"`);
            mainWindow.webContents.send("serial-data", message);
          } else {
            console.log(`[WEATHER] Skipped echo: "${message}"`);
          }
        }
      } catch (err) {
        console.error("Weather serial data error:", err);
        mainWindow.webContents.send("serial-data", `Error: ${err.message}`);
      }
    });

    port.on("close", () => {
      console.log("Weather port closed");
      mainWindow.webContents.send("serial-data", "DISCONNECTED: Port closed");
    });

    port.on("error", (err) => {
      console.error("Weather port error:", err.message);
      mainWindow.webContents.send("serial-data", `Port error: ${err.message}`);
      if (port.isOpen) port.close();
    });

    // Wait longer for port stabilization
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Send a simple command to verify connection
    console.log("Sending initial GET command...");
    await sendCommand("GET", port);

    return `Connected to ${portName} at ${baudRate} baud`;
  } catch (error) {
    console.error("Weather connect error:", error);
    return { error: `Failed to connect to ${portName}: ${error.message}` };
  }
});

ipcMain.handle("disconnect-port", async () => {
  try {
    if (port && port.isOpen) {
      await new Promise((resolve) => port.close(resolve));
      responseBuffer = "";
      lastSentCommand = "";
      return "Disconnected from port.";
    }
    return "No port to disconnect.";
  } catch (error) {
    console.error("Disconnect port error:", error);
    return { error: `Failed to disconnect: ${error.message}` };
  }
});

// --- Device ID Config ---
ipcMain.handle("set-device-id", (event, deviceID) => sendCommand(`SET_DEVICE_ID:${deviceID}`));

// --- Basic config commands ---
// ipcMain.handle("send-data", (event, message) => sendCommand(message));
ipcMain.handle("get-interval", () => sendCommand("GET_INTERVAL"));
ipcMain.handle("get-ftp-config", () => sendCommand("GET_FTP_CONFIG"));
ipcMain.handle("get-mqtt-config", () => sendCommand("GET_MQTT_CONFIG"));
ipcMain.handle("get-http-config", () => sendCommand("GET_HTTP_CONFIG"));

ipcMain.handle("set-interval", async (event, interval) => {
  const i = parseInt(interval);
  if (isNaN(i) || i <= 0) return { error: "Invalid interval" };
  const result = await sendCommand(`SET_INTERVAL:${i}`);
  if (!result.error) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await sendCommand("GET_INTERVAL"); // Verify
  }
  return result;
});

ipcMain.handle("set-protocol", async (event, protocol) => {
  if (!["FTP", "MQTT", "HTTP"].includes(protocol))
    return { error: "Invalid protocol" };
  const result = await sendCommand(`SET_PROTOCOL:${protocol}`);
  if (!result.error) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for initialization
    await sendCommand(`GET_${protocol}_CONFIG`); // Verify
  }
  return result;
});

// --- FTP Config ---
ipcMain.handle("set-ftp-host", (event, host) => sendCommand(`SET_FTP_HOST:${host}`));
ipcMain.handle("set-ftp-user", (event, user) => sendCommand(`SET_FTP_USER:${user}`));
ipcMain.handle("set-ftp-password", (event, pass) => sendCommand(`SET_FTP_PASS:${pass}`));

// --- MQTT Config ---
ipcMain.handle("set-mqtt-broker", async (event, broker) => {
  try {
    console.log(`Setting MQTT broker: ${broker}`);
    mainWindow.webContents.send("serial-data", `Setting MQTT broker to ${broker}`);
    return await sendCommand(`SET_MQTT_BROKER:${broker}`);
  } catch (error) {
    console.error(`Failed to set MQTT broker "${broker}":`, error);
    return { error: `Failed to set MQTT broker: ${error.message}` };
  }
});
ipcMain.handle("set-mqtt-user", (event, user) => sendCommand(`SET_MQTT_USER:${user}`));
ipcMain.handle("set-mqtt-password", (event, pass) => sendCommand(`SET_MQTT_PASS:${pass}`));
ipcMain.handle("set-mqtt-ca-cert", (event, path) => sendCommand(`SET_MQTT_CERT:${path}`));
ipcMain.handle("set-mqtt-client-key", (event, path) => sendCommand(`SET_MQTT_KEY:${path}`));
ipcMain.handle("set-mqtt-ssl", async (event, sslEnabled) => {
  const result = await sendCommand(`SET_MQTT_SSL:${sslEnabled ? "ON" : "OFF"}`);
  if (!result.error) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await sendCommand("GET_MQTT_CONFIG"); // Verify
  }
  return result;
});
ipcMain.handle("set-mqtt-topic", (event, topic) => sendCommand(`SET_PUBLISH_TOPIC:${topic}`));

// --- HTTP Config ---
ipcMain.handle("set-http-url", (event, url) => sendCommand(`SET_HTTP_URL:${url}`));
ipcMain.handle("set-http-auth", (event, auth) => sendCommand(`SET_HTTP_AUTH:${auth}`));

// --- File Upload ---
ipcMain.handle("upload-file", async (event, filePath) => {
  const fileName = path.basename(filePath);
  return sendFile(filePath, fileName);
});

/**
 * Upload MQTT certificates (cert + key) and configure them.
 */
ipcMain.handle("set-mqtt-certificates", async (event, { caCertPath, clientKeyPath }) => {
  if (!port || !port.isOpen) return { error: "Port not open!" };
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const maxRetries = 3;

  try {
    console.log("Starting certificate upload sequence...");

    // Flush UART buffer
    while (port.readable && port.readableLength > 0) {
      port.read();
    }
    console.log("Flushed UART buffer before uploads");

    // Upload certificate
    const certFileName = "device_cert.pem.crt";
    let certResult;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to upload ${certFileName}`);
        certResult = await sendFile(caCertPath, certFileName);
        if (certResult.error) throw new Error(certResult.error);
        break;
      } catch (error) {
        console.error(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt === maxRetries) throw error;
        await delay(2000);
      }
    }

    await delay(2000);

    // Upload private key
    const keyFileName = "private_key.pem.key";
    let keyResult;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to upload ${keyFileName}`);
        keyResult = await sendFile(clientKeyPath, keyFileName);
        if (keyResult.error) throw new Error(keyResult.error);
        break;
      } catch (error) {
        console.error(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt === maxRetries) throw error;
        await delay(2000);
      }
    }

    await delay(2000);

    // Set certificate and key paths
    await sendCommand(`SET_MQTT_CERT:/usr/${certFileName}`);
    await delay(1000);
    await sendCommand(`SET_MQTT_KEY:/usr/${keyFileName}`);
    await delay(1000);
    await sendCommand("SET_MQTT_SSL:ON");
    await delay(1000);
    await sendCommand("SET_PROTOCOL:MQTT");
    await delay(2000);
    await sendCommand("GET_MQTT_CONFIG");

    return "Certificates uploaded and MQTT configured successfully.";
  } catch (error) {
    console.error("Failed to upload certificates or configure MQTT:", error);
    return { error: `Failed to upload certificates or configure MQTT: ${error.message}` };
  }
});

/**
 * File dialog.
 */
ipcMain.handle("open-file-dialog", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
  });
  return canceled ? null : filePaths[0];
});