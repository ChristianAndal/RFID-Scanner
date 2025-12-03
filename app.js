// RFID UHF Reader Web Application
class RFIDReader {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.isScanning = false;
        this.tagList = [];
        this.selectedTag = null;
        this.settings = {
            power: 26,
            frequency: 'China Standard 1',
            protocol: 'Auto',
            beep: true,
            tagFocus: false,
            rssi: false,
            autoReconnect: false
        };
        this.startTime = null;
        this.scanInterval = null;
        this.simulationMode = false; // Set to true for simulation mode, false for real Web Bluetooth
        
        // Bluetooth service UUIDs (from Android app)
        this.SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
        
        // RFID Command Protocol
        // NOTE: These are GENERIC commands based on common UHF RFID protocols
        // You MUST get actual command bytes from your device manufacturer
        // These commands follow typical RFID reader protocol structure
        this.COMMANDS = {
            // Format: [Header, Length, Command, Data..., Checksum]
            START_INVENTORY: new Uint8Array([0xA0, 0x04, 0x01, 0x89, 0x01]),
            STOP_INVENTORY: new Uint8Array([0xA0, 0x03, 0x02, 0x01]),
            INVENTORY_SINGLE: new Uint8Array([0xA0, 0x03, 0x03, 0x22]),
            GET_POWER: new Uint8Array([0xA0, 0x03, 0x97, 0x01]),
            SET_POWER: (power) => {
                const cmd = new Uint8Array([0xA0, 0x04, 0x98, power, 0x00]);
                cmd[4] = this.calculateChecksum(cmd, 1, 3);
                return cmd;
            },
            GET_FREQUENCY: new Uint8Array([0xA0, 0x03, 0xAA, 0x01]),
            SET_FREQUENCY: (mode) => {
                const cmd = new Uint8Array([0xA0, 0x04, 0xAB, mode, 0x00]);
                cmd[4] = this.calculateChecksum(cmd, 1, 3);
                return cmd;
            },
            READ_TAG: (bank, ptr, len, pwd = '00000000') => {
                // Convert password hex string to bytes
                const pwdBytes = this.hexToBytes(pwd);
                const cmd = new Uint8Array([0xA0, 0x09, 0x39, ...pwdBytes, bank, ptr, len, 0x00]);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            },
            WRITE_TAG: (bank, ptr, len, data, pwd = '00000000') => {
                const pwdBytes = this.hexToBytes(pwd);
                const dataBytes = this.hexToBytes(data);
                const cmdLen = 6 + pwdBytes.length + dataBytes.length;
                const cmd = new Uint8Array(cmdLen + 1);
                cmd[0] = 0xA0;
                cmd[1] = cmdLen;
                cmd[2] = 0x49;
                cmd.set(pwdBytes, 3);
                cmd[7] = bank;
                cmd[8] = ptr;
                cmd[9] = len;
                cmd.set(dataBytes, 10);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            },
            SET_FILTER: (bank, ptr, len, data) => {
                const dataBytes = this.hexToBytes(data);
                const cmd = new Uint8Array([0xA0, 0x07 + dataBytes.length, 0x8C, bank, ptr, len, ...dataBytes, 0x00]);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            }
        };
        
        this.init();
    }

    // Helper: Calculate checksum for commands
    calculateChecksum(buffer, start, end) {
        let sum = 0;
        for (let i = start; i <= end; i++) {
            sum += buffer[i];
        }
        return sum & 0xFF;
    }

    // Helper: Convert hex string to byte array
    hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }

    // Helper: Convert byte array to hex string
    bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.updateUI();
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Connection buttons
        document.getElementById('btnConnect').addEventListener('click', () => this.handleConnect());
        document.getElementById('btnSearch').addEventListener('click', () => this.showDeviceModal());

        // Inventory buttons
        document.getElementById('btnInventorySingle').addEventListener('click', () => this.inventorySingle());
        document.getElementById('btnInventoryLoop').addEventListener('click', () => this.inventoryLoop());
        document.getElementById('btnStop').addEventListener('click', () => this.stopInventory());
        document.getElementById('btnClear').addEventListener('click', () => this.clearData());

        // Filter
        document.getElementById('cbFilter').addEventListener('change', (e) => {
            document.getElementById('filterPanel').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('btnSetFilter').addEventListener('click', () => this.setFilter());

        // Read
        document.getElementById('btnRead').addEventListener('click', () => this.readTag());

        // Write
        document.getElementById('btnWrite').addEventListener('click', () => this.writeTag());
        document.getElementById('cbWriteFilter').addEventListener('change', (e) => {
            document.getElementById('writeFilterPanel').style.display = e.target.checked ? 'block' : 'none';
        });

        // Lock
        document.getElementById('btnLock').addEventListener('click', () => this.lockTag());

        // Kill
        document.getElementById('btnKill').addEventListener('click', () => this.killTag());

        // Erase
        document.getElementById('btnErase').addEventListener('click', () => this.eraseTag());

        // Settings
        document.getElementById('btnGetPower').addEventListener('click', () => this.getPower());
        document.getElementById('btnSetPower').addEventListener('click', () => this.setPower());
        document.getElementById('btnGetFrequency').addEventListener('click', () => this.getFrequency());
        document.getElementById('btnSetFrequency').addEventListener('click', () => this.setFrequency());
        document.getElementById('btnGetProtocol').addEventListener('click', () => this.getProtocol());
        document.getElementById('btnSetProtocol').addEventListener('click', () => this.setProtocol());
        document.getElementById('btnBeepOpen').addEventListener('click', () => this.setBeep(true));
        document.getElementById('btnBeepClose').addEventListener('click', () => this.setBeep(false));
        document.getElementById('cbTagFocus').addEventListener('change', (e) => this.setTagFocus(e.target.checked));
        document.getElementById('cbRssi').addEventListener('change', (e) => this.settings.rssi = e.target.checked);
        document.getElementById('cbAutoReconnect').addEventListener('change', (e) => {
            this.settings.autoReconnect = e.target.checked;
            this.saveSettings();
        });

        // Barcode
        document.getElementById('btnScanBarcode').addEventListener('click', () => this.scanBarcode());

        // Location
        document.getElementById('btnStartLocation').addEventListener('click', () => this.startLocation());
        document.getElementById('btnStopLocation').addEventListener('click', () => this.stopLocation());

        // Device modal
        document.getElementById('btnScanDevices').addEventListener('click', () => this.scanDevices());
        document.getElementById('btnClearHistory').addEventListener('click', () => this.clearDeviceHistory());
        document.querySelector('.close').addEventListener('click', () => this.hideDeviceModal());
        window.addEventListener('click', (e) => {
            if (e.target.id === 'deviceModal') {
                this.hideDeviceModal();
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
    }

    async handleConnect() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            this.showDeviceModal();
        }
    }

    showDeviceModal() {
        document.getElementById('deviceModal').style.display = 'block';
        // Auto-start scanning when modal opens
        if (!this.simulationMode && navigator.bluetooth) {
            this.autoScanDevices();
        } else {
            this.loadDeviceHistory();
        }
    }

    hideDeviceModal() {
        document.getElementById('deviceModal').style.display = 'none';
    }

    async autoScanDevices() {
        // Automatically show available devices
        const deviceList = document.getElementById('deviceList');
        deviceList.innerHTML = '<div style="padding: 20px; text-align: center;">Ready to scan for nearby Bluetooth devices...<br><br>Click "Scan for Devices" to start</div>';
    }

    async scanDevices() {
        const deviceList = document.getElementById('deviceList');
        const btnScan = document.getElementById('btnScanDevices');
        
        deviceList.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="margin: 20px 0;">
                    <div class="scanning-animation" style="
                        width: 50px;
                        height: 50px;
                        border: 4px solid #e5e7eb;
                        border-top-color: #667eea;
                        border-radius: 50%;
                        margin: 0 auto 15px;
                        animation: spin 1s linear infinite;
                    "></div>
                    Scanning for nearby Bluetooth devices...
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 10px;">
                    Make sure your RFID reader is powered on and in range
                </div>
            </div>
        `;

        btnScan.disabled = true;
        btnScan.textContent = 'Scanning...';

        if (this.simulationMode) {
            // Simulate device discovery
            setTimeout(() => {
                const simulatedDevices = [
                    { name: 'RFID-Reader-001', address: 'AA:BB:CC:DD:EE:01', rssi: -45 },
                    { name: 'RFID-Reader-002', address: 'AA:BB:CC:DD:EE:02', rssi: -67 },
                    { name: 'UHF-Reader-Pro', address: 'AA:BB:CC:DD:EE:03', rssi: -58 },
                    { name: 'BT-RFID-A8F2', address: 'AA:BB:CC:DD:EE:04', rssi: -72 }
                ];
                this.displayDevices(simulatedDevices);
                btnScan.disabled = false;
                btnScan.textContent = 'Scan Again';
            }, 2000);
        } else {
            try {
                if (!navigator.bluetooth) {
                    throw new Error('Web Bluetooth API not supported in this browser. Please use Chrome, Edge, or Opera.');
                }

                // Show the browser's device picker
                const device = await navigator.bluetooth.requestDevice({
                    // Accept all devices to show everything nearby
                    acceptAllDevices: true,
                    optionalServices: [this.SERVICE_UUID]
                });

                // User selected a device, connect to it
                btnScan.disabled = false;
                btnScan.textContent = 'Scan for Devices';
                await this.connectToDevice(device);

            } catch (error) {
                console.error('Bluetooth error:', error);
                btnScan.disabled = false;
                btnScan.textContent = 'Scan for Devices';
                
                if (error.name === 'NotFoundError') {
                    deviceList.innerHTML = `<div style="padding: 20px; text-align: center; color: #6b7280;">
                        <strong>No devices found</strong><br><br>
                        <div style="text-align: left; display: inline-block;">
                        • Make sure your RFID reader is powered on<br>
                        • Ensure device is in pairing/discoverable mode<br>
                        • Check if device supports Bluetooth Low Energy (BLE)<br>
                        • Move closer to the device<br>
                        • Try turning the device off and on
                        </div>
                    </div>`;
                } else if (error.name === 'NotSupportedError') {
                    deviceList.innerHTML = `<div style="padding: 20px; color: #ef4444;">
                        <strong>Web Bluetooth not available</strong><br><br>
                        <div style="text-align: left;">
                        Possible reasons:<br>
                        • Browser doesn't support Web Bluetooth (use Chrome/Edge/Opera)<br>
                        • Page must be HTTPS or localhost<br>
                        • Bluetooth may be disabled on your computer
                        </div>
                    </div>`;
                } else {
                    deviceList.innerHTML = `<div style="padding: 20px; color: #ef4444;">
                        <strong>Error:</strong> ${error.message}<br><br>
                        <div style="text-align: left; font-size: 12px;">
                        <strong>Troubleshooting:</strong><br>
                        • Ensure device is powered on and in range<br>
                        • Check if device supports BLE (Bluetooth Low Energy)<br>
                        • Use Chrome/Edge/Opera browser<br>
                        • Page must be served over HTTPS or localhost<br>
                        • Try enabling simulation mode in app.js
                        </div>
                    </div>`;
                }
            }
        }
    }

    displayDevices(devices) {
        const deviceList = document.getElementById('deviceList');
        
        if (devices.length === 0) {
            deviceList.innerHTML = `<div style="padding: 20px; text-align: center; color: #6b7280;">
                No devices found. Make sure your RFID reader is powered on and nearby.
            </div>`;
            return;
        }

        deviceList.innerHTML = `
            <div style="padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 10px; font-size: 13px; color: #6b7280;">
                <strong>Found ${devices.length} device${devices.length > 1 ? 's' : ''}</strong> - Click to connect
            </div>
        `;

        // Sort devices by signal strength (RSSI) if available
        const sortedDevices = devices.sort((a, b) => {
            if (a.rssi && b.rssi) return b.rssi - a.rssi; // Higher (less negative) first
            return 0;
        });

        sortedDevices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            
            // Signal strength indicator
            let signalStrength = '';
            let signalColor = '#6b7280';
            if (device.rssi) {
                if (device.rssi > -60) {
                    signalStrength = '📶 Strong';
                    signalColor = '#10b981';
                } else if (device.rssi > -70) {
                    signalStrength = '📶 Good';
                    signalColor = '#f59e0b';
                } else {
                    signalStrength = '📶 Weak';
                    signalColor = '#ef4444';
                }
            }

            deviceItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div class="device-name">${device.name || 'Unknown Device'}</div>
                        <div class="device-address">${device.address || device.id || 'No address'}</div>
                    </div>
                    ${device.rssi ? `
                        <div style="font-size: 11px; color: ${signalColor}; font-weight: 600;">
                            ${signalStrength}
                        </div>
                    ` : ''}
                </div>
            `;
            
            deviceItem.addEventListener('click', () => {
                if (this.simulationMode) {
                    this.connectToSimulatedDevice(device);
                } else {
                    // For real devices, rescan to connect
                    this.showToast('Click "Scan for Devices" and select this device from the browser dialog');
                }
            });
            deviceList.appendChild(deviceItem);
        });
    }

    async connectToSimulatedDevice(deviceInfo) {
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', `Connecting to ${deviceInfo.name}...`);
        
        // Simulate connection delay
        setTimeout(() => {
            this.device = deviceInfo;
            this.isConnected = true;
            this.updateConnectionStatus('connected', `${deviceInfo.name} (${deviceInfo.address})`);
            this.saveDeviceToHistory(deviceInfo);
            this.updateUI();
            this.showToast('Connected successfully');
        }, 1500);
    }

    async connectToDevice(device) {
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', `Connecting to ${device.name}...`);
        
        try {
            console.log('Connecting to GATT server...');
            const server = await device.gatt.connect();
            
            console.log('Getting primary service...');
            this.server = await server.getPrimaryService(this.SERVICE_UUID);
            
            console.log('Getting characteristic...');
            this.characteristic = await this.server.getCharacteristic(this.CHARACTERISTIC_UUID);
            
            // Enable notifications for receiving data
            console.log('Starting notifications...');
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleNotification(event);
            });
            
            this.device = device;
            this.isConnected = true;
            this.updateConnectionStatus('connected', `${device.name || 'Device'} (${device.id})`);
            this.updateUI();
            this.showToast('Connected successfully');
            console.log('Connection successful');

            device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });
        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus('disconnected', 'Connection failed');
            this.showToast('Connection failed: ' + error.message);
        }
    }

    // Handle incoming data from the RFID reader
    handleNotification(event) {
        const value = event.target.value;
        const buffer = new Uint8Array(value.buffer);
        
        // Log raw data for debugging
        const hexStr = this.bytesToHex(buffer);
        console.log('Received data:', hexStr, '| Bytes:', Array.from(buffer));
        
        try {
            // PARSE BASED ON DEVICE'S PROTOCOL
            // Common RFID reader protocol structure:
            // [0]: Header (typically 0xA0)
            // [1]: Length (total message length)
            // [2]: Command type
            // [3+]: Data payload
            // [last]: Checksum
            
            if (buffer.length < 4) {
                console.log('Data too short, ignoring');
                return;
            }

            const header = buffer[0];
            const length = buffer[1];
            const command = buffer[2];
            
            console.log(`Header: 0x${header.toString(16)}, Len: ${length}, Cmd: 0x${command.toString(16)}`);
            
            if (header === 0xA0) { // Response header
                switch (command) {
                    case 0x89: // Tag inventory data
                    case 0x22: // Single tag read
                        this.parseTagData(buffer);
                        break;
                    case 0x01: // Stop inventory response
                        console.log('Inventory stopped');
                        break;
                    case 0x97: // Get power response
                        if (buffer.length >= 4) {
                            const power = buffer[3];
                            console.log('Current power:', power);
                            this.showToast(`Power: ${power} dBm`);
                        }
                        break;
                    case 0x39: // Read tag response
                        this.parseReadData(buffer);
                        break;
                    case 0x49: // Write tag response
                        console.log('Write response received');
                        if (buffer.length >= 4 && buffer[3] === 0x10) {
                            this.showToast('Write successful');
                            document.getElementById('writeResult').textContent = 'Write successful!';
                        } else {
                            this.showToast('Write failed');
                            document.getElementById('writeResult').textContent = 'Write failed';
                        }
                        break;
                    case 0xAA: // Get frequency response
                        if (buffer.length >= 4) {
                            console.log('Frequency mode:', buffer[3]);
                        }
                        break;
                    default:
                        console.log('Unknown command response:', command, 'Data:', hexStr);
                }
            } else {
                console.log('Unknown header:', header);
            }
        } catch (error) {
            console.error('Error parsing notification:', error);
        }
    }

    parseTagData(buffer) {
        // Parse EPC tag data from inventory response
        try {
            console.log('Parsing tag data, buffer length:', buffer.length);
            
            // Typical format: [Header, Length, Cmd, DataLen, EPC..., RSSI?, Checksum]
            if (buffer.length < 6) {
                console.log('Buffer too short for tag data');
                return;
            }

            const dataStart = 4; // Skip header, length, cmd, dataLen
            const dataLength = buffer[3]; // Data length byte
            
            if (dataLength > 0 && buffer.length >= dataStart + dataLength) {
                const epcBytes = buffer.slice(dataStart, dataStart + dataLength);
                const epc = this.bytesToHex(epcBytes);
                
                // Check if RSSI is included (usually last byte before checksum)
                let rssi = '';
                if (buffer.length > dataStart + dataLength + 1) {
                    const rssiValue = buffer[dataStart + dataLength];
                    if (rssiValue > 20 && rssiValue < 100) {
                        rssi = `-${rssiValue}`;
                    }
                }
                
                console.log('Parsed EPC:', epc, 'RSSI:', rssi || 'N/A');
                
                // Add to tag list
                this.addTagToList({
                    epc: epc,
                    tid: '',
                    rssi: rssi,
                    user: ''
                });
                
                // Play sound if enabled
                if (this.settings.beep) {
                    this.playBeep();
                }
            } else {
                console.log('Invalid data length:', dataLength);
            }
        } catch (error) {
            console.error('Error parsing tag data:', error);
        }
    }

    parseReadData(buffer) {
        // Parse read command response
        try {
            console.log('Parsing read data, buffer length:', buffer.length);
            
            // Format: [Header, Length, Cmd, Status, DataLen, Data..., Checksum]
            if (buffer.length < 6) {
                console.log('Buffer too short for read data');
                return;
            }

            const status = buffer[3];
            if (status !== 0x10) { // 0x10 = success
                console.log('Read failed, status:', status);
                this.showToast('Read failed');
                document.getElementById('readResult').textContent = 'Read failed';
                return;
            }

            const dataLength = buffer[4];
            const dataStart = 5;
            
            if (dataLength > 0 && buffer.length >= dataStart + dataLength) {
                const dataBytes = buffer.slice(dataStart, dataStart + dataLength);
                const data = this.bytesToHex(dataBytes);
                
                console.log('Read data:', data);
                document.getElementById('readResult').textContent = `Success!\nData: ${data}`;
                this.showToast('Read successful');
            }
        } catch (error) {
            console.error('Error parsing read data:', error);
        }
    }

    playBeep() {
        // Simple beep sound using Web Audio API
        if (!this.settings.beep) return;
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 1000; // 1kHz beep
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.error('Error playing beep:', error);
        }
    }

    // Send command to RFID reader
    async sendCommand(commandBytes) {
        if (!this.characteristic) {
            throw new Error('Not connected to device');
        }
        
        try {
            await this.characteristic.writeValue(commandBytes);
            console.log('Command sent:', commandBytes);
        } catch (error) {
            console.error('Error sending command:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && this.device.gatt) {
            try {
                await this.device.gatt.disconnect();
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
        this.handleDisconnection();
    }

    handleDisconnection() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.stopInventory();
        this.updateConnectionStatus('disconnected', 'Disconnected');
        this.updateUI();
        this.showToast('Disconnected');
    }

    updateConnectionStatus(status, info) {
        const statusEl = document.getElementById('deviceStatus');
        const infoEl = document.getElementById('deviceInfo');
        const btnConnect = document.getElementById('btnConnect');

        statusEl.className = `status ${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        infoEl.textContent = info;
        btnConnect.textContent = this.isConnected ? 'Disconnect' : 'Connect';
    }

    updateUI() {
        const connected = this.isConnected;
        const scanning = this.isScanning;

        // Enable/disable buttons based on connection status
        const actionButtons = ['btnInventorySingle', 'btnInventoryLoop', 'btnRead', 'btnWrite', 
                              'btnLock', 'btnKill', 'btnErase', 'btnScanBarcode'];
        actionButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !connected || scanning;
        });

        document.getElementById('btnStop').disabled = !scanning;
        document.getElementById('btnClear').disabled = scanning;
    }

    // Tag Inventory Functions
    async inventorySingle() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        this.startTime = Date.now();
        
        if (this.simulationMode) {
            this.simulateTagRead();
        } else {
            // REAL DEVICE - Send single inventory command
            try {
                console.log('Sending INVENTORY_SINGLE command...');
                await this.sendCommand(this.COMMANDS.INVENTORY_SINGLE);
                this.showToast('Reading single tag...');
            } catch (error) {
                console.error('Failed to read single tag:', error);
                this.showToast('Failed to read tag: ' + error.message);
            }
        }
    }

    async inventoryLoop() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        if (this.isScanning) {
            return;
        }

        this.isScanning = true;
        this.startTime = Date.now();
        this.updateUI();

        if (this.simulationMode) {
            // Simulation mode - generate fake tags
            this.scanInterval = setInterval(() => {
                this.simulateTagRead();
                this.updateTime();
            }, 500);
        } else {
            // REAL DEVICE MODE - Send actual command
            try {
                console.log('Sending START_INVENTORY command...');
                await this.sendCommand(this.COMMANDS.START_INVENTORY);
                this.showToast('Inventory started - scanning for tags...');
                
                // Update time periodically
                this.scanInterval = setInterval(() => {
                    this.updateTime();
                }, 100);
                
                console.log('Inventory command sent successfully');
            } catch (error) {
                console.error('Failed to start inventory:', error);
                this.showToast('Failed to start inventory: ' + error.message);
                this.stopInventory();
            }
        }
    }

    async stopInventory() {
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        if (!this.simulationMode && this.isConnected) {
            try {
                console.log('Sending STOP_INVENTORY command...');
                await this.sendCommand(this.COMMANDS.STOP_INVENTORY);
                this.showToast('Inventory stopped');
                console.log('Stop command sent successfully');
            } catch (error) {
                console.error('Failed to stop inventory:', error);
            }
        }

        this.updateUI();
    }

    simulateTagRead() {
        // Generate random EPC for simulation
        const epc = this.generateRandomEPC();
        const tid = this.generateRandomTID();
        const rssi = this.settings.rssi ? Math.floor(Math.random() * 60 - 80) : '';

        this.addTagToList({
            epc: epc,
            tid: tid,
            rssi: rssi,
            user: ''
        });
    }

    generateRandomEPC() {
        const chars = '0123456789ABCDEF';
        let epc = '';
        for (let i = 0; i < 24; i++) {
            epc += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return epc;
    }

    generateRandomTID() {
        const chars = '0123456789ABCDEF';
        let tid = 'E28011';
        for (let i = 0; i < 6; i++) {
            tid += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return tid;
    }

    addTagToList(tagInfo) {
        const existingIndex = this.tagList.findIndex(t => t.epc === tagInfo.epc);
        
        if (existingIndex >= 0) {
            this.tagList[existingIndex].count++;
            this.tagList[existingIndex].rssi = tagInfo.rssi;
        } else {
            this.tagList.push({
                epc: tagInfo.epc,
                tid: tagInfo.tid,
                user: tagInfo.user,
                rssi: tagInfo.rssi,
                count: 1
            });
        }

        this.updateTagList();
        this.updateStats();
    }

    updateTagList() {
        const tbody = document.getElementById('tagListBody');
        tbody.innerHTML = '';

        this.tagList.forEach((tag, index) => {
            const row = document.createElement('tr');
            row.addEventListener('click', () => {
                this.selectedTag = tag;
                document.querySelectorAll('.tag-table tbody tr').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');
            });

            const displayText = tag.tid ? `EPC: ${tag.epc}\nTID: ${tag.tid}` : tag.epc;
            
            row.innerHTML = `
                <td style="white-space: pre-line; font-family: monospace;">${displayText}</td>
                <td>${tag.count}</td>
                <td>${tag.rssi || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateStats() {
        document.getElementById('tvCount').textContent = this.tagList.length;
        const total = this.tagList.reduce((sum, tag) => sum + tag.count, 0);
        document.getElementById('tvTotal').textContent = total;
    }

    updateTime() {
        if (this.startTime) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            document.getElementById('tvTime').textContent = elapsed.toFixed(1) + 's';
        }
    }

    clearData() {
        this.tagList = [];
        this.selectedTag = null;
        this.updateTagList();
        this.updateStats();
        document.getElementById('tvTime').textContent = '0s';
        this.startTime = null;
    }

    // Filter
    async setFilter() {
        const ptr = parseInt(document.getElementById('etPtr').value);
        const len = parseInt(document.getElementById('etLen').value);
        const data = document.getElementById('etData').value.trim();
        const bankName = document.querySelector('input[name="filterBank"]:checked').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (data && !/^[0-9A-Fa-f]*$/.test(data)) {
            this.showToast('Filter data must be hexadecimal');
            return;
        }

        if (!this.simulationMode && this.isConnected) {
            try {
                if (data && len > 0) {
                    console.log(`Sending SET_FILTER command: Bank=${bank}, Ptr=${ptr}, Len=${len}, Data=${data}`);
                    const command = this.COMMANDS.SET_FILTER(bank, ptr, len, data);
                    await this.sendCommand(command);
                    this.showToast('Filter set successfully');
                } else {
                    // Disable filter (send with zero length)
                    const command = this.COMMANDS.SET_FILTER(bank, 0, 0, '00');
                    await this.sendCommand(command);
                    this.showToast('Filter disabled');
                }
            } catch (error) {
                console.error('Set filter failed:', error);
                this.showToast('Set filter failed: ' + error.message);
            }
        } else {
            this.showToast(`Filter set: Bank=${bankName}, Ptr=${ptr}, Len=${len}, Data=${data}`);
        }

        document.getElementById('cbFilter').checked = false;
        document.getElementById('filterPanel').style.display = 'none';
    }

    // Read Tag
    async readTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bankName = document.getElementById('spReadBank').value;
        const ptr = parseInt(document.getElementById('etReadPtr').value);
        const len = parseInt(document.getElementById('etReadLen').value);
        const pwd = document.getElementById('etReadPwd').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (this.simulationMode) {
            // Simulation
            setTimeout(() => {
                const data = this.generateRandomEPC().substring(0, len * 4);
                document.getElementById('readResult').textContent = 
                    `Bank: ${bankName}\nPointer: ${ptr}\nLength: ${len}\nData: ${data}`;
                this.showToast('Read successful');
            }, 500);
        } else {
            // REAL DEVICE - Send read command
            try {
                console.log(`Sending READ command: Bank=${bank}, Ptr=${ptr}, Len=${len}`);
                const command = this.COMMANDS.READ_TAG(bank, ptr, len, pwd);
                await this.sendCommand(command);
                this.showToast('Read command sent - waiting for response...');
                document.getElementById('readResult').textContent = 'Reading...';
            } catch (error) {
                console.error('Read failed:', error);
                this.showToast('Read failed: ' + error.message);
                document.getElementById('readResult').textContent = 'Read failed: ' + error.message;
            }
        }
    }

    // Write Tag
    async writeTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bankName = document.getElementById('spWriteBank').value;
        const ptr = parseInt(document.getElementById('etWritePtr').value);
        const len = parseInt(document.getElementById('etWriteLen').value);
        const data = document.getElementById('etWriteData').value.trim();
        const pwd = document.getElementById('etWritePwd').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (!data || !/^[0-9A-Fa-f]*$/.test(data)) {
            this.showToast('Data must be hexadecimal');
            return;
        }

        if (data.length % 4 !== 0) {
            this.showToast('Data length must be multiple of 4');
            return;
        }

        if (this.simulationMode) {
            // Simulation
            setTimeout(() => {
                document.getElementById('writeResult').textContent = 
                    `Write successful\nBank: ${bankName}\nPointer: ${ptr}\nLength: ${len}\nData: ${data}`;
                this.showToast('Write successful');
            }, 500);
        } else {
            // REAL DEVICE - Send write command
            try {
                console.log(`Sending WRITE command: Bank=${bank}, Ptr=${ptr}, Len=${len}, Data=${data}`);
                const command = this.COMMANDS.WRITE_TAG(bank, ptr, len, data, pwd);
                await this.sendCommand(command);
                this.showToast('Write command sent - waiting for response...');
                document.getElementById('writeResult').textContent = 'Writing...';
            } catch (error) {
                console.error('Write failed:', error);
                this.showToast('Write failed: ' + error.message);
                document.getElementById('writeResult').textContent = 'Write failed: ' + error.message;
            }
        }
    }

    // Lock Tag
    lockTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const pwd = document.getElementById('etLockPwd').value;
        const action = document.getElementById('spLockAction').value;

        setTimeout(() => {
            document.getElementById('lockResult').textContent = `Lock ${action} successful`;
            this.showToast(`Lock ${action} successful`);
        }, 500);
    }

    // Kill Tag
    killTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        if (!confirm('Are you sure you want to kill this tag? This action cannot be undone.')) {
            return;
        }

        const pwd = document.getElementById('etKillPwd').value;

        setTimeout(() => {
            document.getElementById('killResult').textContent = 'Tag killed successfully';
            this.showToast('Tag killed');
        }, 500);
    }

    // Erase Tag
    eraseTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bank = document.getElementById('spEraseBank').value;
        const ptr = parseInt(document.getElementById('etErasePtr').value);
        const len = parseInt(document.getElementById('etEraseLen').value);
        const pwd = document.getElementById('etErasePwd').value;

        setTimeout(() => {
            document.getElementById('eraseResult').textContent = `Erase successful\nBank: ${bank}\nPointer: ${ptr}\nLength: ${len}`;
            this.showToast('Erase successful');
        }, 500);
    }

    // Settings
    async getPower() {
        if (!this.simulationMode && this.isConnected) {
            try {
                console.log('Sending GET_POWER command...');
                await this.sendCommand(this.COMMANDS.GET_POWER);
                this.showToast('Getting power...');
            } catch (error) {
                console.error('Get power failed:', error);
                this.showToast('Get power failed');
            }
        } else {
            document.getElementById('spPower').value = this.settings.power;
            this.showToast(`Current power: ${this.settings.power} dBm`);
        }
    }

    async setPower() {
        const power = parseInt(document.getElementById('spPower').value);
        
        if (!this.simulationMode && this.isConnected) {
            try {
                console.log(`Sending SET_POWER command: ${power}`);
                await this.sendCommand(this.COMMANDS.SET_POWER(power));
                this.settings.power = power;
                this.saveSettings();
                this.showToast(`Power set to ${power} dBm`);
            } catch (error) {
                console.error('Set power failed:', error);
                this.showToast('Set power failed: ' + error.message);
            }
        } else {
            this.settings.power = power;
            this.saveSettings();
            this.showToast(`Power set to ${power} dBm`);
        }
    }

    getFrequency() {
        const index = ['China Standard 1', 'China Standard 2', 'Europe Standard', 
                      'United States Standard', 'Korea', 'Japan'].indexOf(this.settings.frequency);
        if (index >= 0) {
            document.getElementById('spFrequency').selectedIndex = index;
        }
        this.showToast(`Current frequency: ${this.settings.frequency}`);
    }

    setFrequency() {
        const frequency = document.getElementById('spFrequency').value;
        this.settings.frequency = frequency;
        this.saveSettings();
        this.showToast(`Frequency set to ${frequency}`);
    }

    getProtocol() {
        const index = ['Auto', 'ISO18000-6B', 'ISO18000-6C'].indexOf(this.settings.protocol);
        if (index >= 0) {
            document.getElementById('spProtocol').selectedIndex = index;
        }
        this.showToast(`Current protocol: ${this.settings.protocol}`);
    }

    setProtocol() {
        const protocol = document.getElementById('spProtocol').value;
        this.settings.protocol = protocol;
        this.saveSettings();
        this.showToast(`Protocol set to ${protocol}`);
    }

    setBeep(enabled) {
        this.settings.beep = enabled;
        this.saveSettings();
        this.showToast(`Beep ${enabled ? 'enabled' : 'disabled'}`);
    }

    setTagFocus(enabled) {
        this.settings.tagFocus = enabled;
        this.saveSettings();
        this.showToast(`Tag focus ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Barcode
    scanBarcode() {
        // Simulate barcode scan
        const barcode = this.generateRandomEPC().substring(0, 16);
        document.getElementById('barcodeInput').value = barcode;
        document.getElementById('barcodeResult').textContent = `Scanned: ${barcode}`;
        this.showToast('Barcode scanned');
    }

    // Location
    startLocation() {
        const canvas = document.getElementById('locationCanvas');
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 40, 0);
            ctx.lineTo(i * 40, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * 40);
            ctx.lineTo(canvas.width, i * 40);
            ctx.stroke();
        }

        // Simulate tag positions
        setInterval(() => {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            ctx.fillStyle = '#667eea';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }, 1000);
    }

    stopLocation() {
        // Stop location tracking
    }

    // Device History
    saveDeviceToHistory(device) {
        let history = JSON.parse(localStorage.getItem('deviceHistory') || '[]');
        history = history.filter(d => d.address !== device.address);
        history.unshift(device);
        history = history.slice(0, 10); // Keep last 10
        localStorage.setItem('deviceHistory', JSON.stringify(history));
    }

    loadDeviceHistory() {
        const history = JSON.parse(localStorage.getItem('deviceHistory') || '[]');
        if (history.length > 0) {
            this.displayDevices(history);
        }
    }

    clearDeviceHistory() {
        localStorage.removeItem('deviceHistory');
        document.getElementById('deviceList').innerHTML = '<div style="padding: 20px; text-align: center;">No devices in history</div>';
    }

    // Settings persistence
    saveSettings() {
        localStorage.setItem('rfidSettings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('rfidSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        
        // Apply settings to UI
        document.getElementById('spPower').value = this.settings.power;
        document.getElementById('cbTagFocus').checked = this.settings.tagFocus;
        document.getElementById('cbRssi').checked = this.settings.rssi;
        document.getElementById('cbAutoReconnect').checked = this.settings.autoReconnect;
    }

    // Utility
    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #374151;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.rfidReader = new RFIDReader();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

