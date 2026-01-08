const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  listPorts: () => ipcRenderer.invoke("list-ports"),
  connectPort: (portName, baudRate) => ipcRenderer.invoke("connect-port", portName, baudRate),
  disconnectPort: () => ipcRenderer.invoke("disconnect-port"),
   // Weather Station specific
  weatherSendData: (msg) => ipcRenderer.invoke("weather-send-data", msg),
  
  // Gateway specific
  gatewaySendData: (msg) => ipcRenderer.invoke("gateway-send-data", msg),
  
  // Generic (uses whichever port is open)
  sendData: (msg) => ipcRenderer.invoke("send-data", msg),
  setInterval: (interval) => ipcRenderer.invoke("set-interval", interval),
  getInterval: () => ipcRenderer.invoke("get-interval"),
  setProtocol: (protocol) => ipcRenderer.invoke("set-protocol", protocol),
  setFTPHost: (host) => ipcRenderer.invoke("set-ftp-host", host),
  setFTPUser: (user) => ipcRenderer.invoke("set-ftp-user", user),
  setFTPPassword: (password) => ipcRenderer.invoke("set-ftp-password", password),
  getFTPConfig: () => ipcRenderer.invoke("get-ftp-config"),
  setMQTTCACert: (filePath) => ipcRenderer.invoke("set-mqtt-ca-cert", filePath),
  setMQTTClientKey: (filePath) => ipcRenderer.invoke("set-mqtt-client-key", filePath),
  setMQTTBroker: (broker) => ipcRenderer.invoke("set-mqtt-broker", broker),
  setMQTTPort: (port) => ipcRenderer.invoke("set-mqtt-port", port),
  setMQTTUser: (user) => ipcRenderer.invoke("set-mqtt-user", user),
  setMQTTPassword: (password) => ipcRenderer.invoke("set-mqtt-password", password),
  setMQTTSSL: (sslEnabled) => ipcRenderer.invoke("set-mqtt-ssl", sslEnabled),
  setMQTTTopic: (topic) => ipcRenderer.invoke("set-mqtt-topic", topic),
  getMQTTConfig: () => ipcRenderer.invoke("get-mqtt-config"),
  setHTTPURL: (url) => ipcRenderer.invoke("set-http-url", url),
  setHTTPAuth: (auth) => ipcRenderer.invoke("set-http-auth", auth),
  getHTTPConfig: () => ipcRenderer.invoke("get-http-config"),
  uploadFile: (filename) => ipcRenderer.invoke("upload-file", filename),
  setDeviceID: (deviceID) => ipcRenderer.invoke("set-device-id", deviceID),
  getDeviceID: () => ipcRenderer.invoke("get-device-id"),
  onSerialData: (callback) => ipcRenderer.on("serial-data", (event, data) => callback(data)),
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  readFileAsText: (path) => ipcRenderer.invoke("read-file-as-text", path),
  setMQTTCertificates: (paths) => ipcRenderer.invoke("set-mqtt-certificates", paths),

  // Gateway-specific
  connectGatewayPort: (portName, baudRate) => ipcRenderer.invoke("connect-gateway-port", { portName, baudRate }),
  disconnectGatewayPort: () => ipcRenderer.invoke("disconnect-gateway-port"),
 onGatewaySerialData: (callback) => {
  ipcRenderer.on("gateway-serial-data", (event, data) => {
    console.log("[PRELOAD] Gateway data received:", data);
    callback(data);
  });
},
});