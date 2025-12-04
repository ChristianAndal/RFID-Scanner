# RFID UHF Reader - Web Application

A web-based RFID UHF reader application converted from Android to HTML/JavaScript. This application provides a comprehensive interface for managing RFID tags through a Bluetooth-connected UHF reader.

## Features

- **Device Management**: Scan and connect to RFID readers via Bluetooth (Web Bluetooth API)
- **Tag Inventory**: Read RFID tags continuously or perform single reads
- **Tag Operations**: 
  - Read tag data from different memory banks (EPC, TID, USER, RESERVED)
  - Write data to tags
  - Lock tags with various lock actions
  - Kill tags (permanently disable)
  - Erase tag data
- **Settings**: Configure reader power, frequency, protocol, and other settings
- **Tag Filtering**: Filter tags by EPC, TID, or USER bank data
- **Location Tracking**: Visual tag location display on canvas
- **Barcode Scanning**: 2D barcode scanning support
- **Data Export**: Tag data management and display

## Usage

1. Open `index.html` in a modern web browser (Chrome, Edge, or Opera recommended for Web Bluetooth support)
2. Click "Search" or "Connect" button
3. Click "Scan for Devices" to see nearby Bluetooth devices
4. Select your RFID reader from the browser's device picker dialog
5. Once connected, use the tabs to access different features:
   - **Inventory**: Read tags continuously or individually
   - **2D Scan**: Scan barcodes
   - **Settings**: Configure reader parameters
   - **Location**: Track tag positions
   - **Read/Write/Lock/Kill/Erase**: Perform tag operations

## Browser Compatibility

- **Web Bluetooth API**: Chrome 56+, Edge 79+, Opera 43+ (Desktop & Android)
- **WebSocket Bridge**: Works in ALL browsers including iOS Safari! 🌐
- **Mobile Support**: ✅ iOS and Android supported via WebSocket Bridge

### Mobile Platforms

- **Android**: Use Chrome/Edge/Opera with Web Bluetooth (Direct) or any browser with WebSocket Bridge
- **iOS**: Use WebSocket Bridge (works in Safari) or Chrome/Edge with Web Bluetooth

📱 See [MOBILE_SETUP_GUIDE.md](MOBILE_SETUP_GUIDE.md) for detailed mobile setup instructions.

## Connection Modes

### Real Hardware Mode (Current)
The application is set to **real hardware mode** (`simulationMode = false`). This mode:
- Connects to actual Bluetooth RFID devices
- Sends real RFID commands
- Receives and parses real tag data
- Requires compatible hardware

### Simulation Mode
To switch to simulation mode for testing without hardware:

1. **Enable Simulation** in `app.js`:
   ```javascript
   this.simulationMode = true; // Change from false to true
   ```

2. **Requirements**:
   - Chrome, Edge, or Opera browser (Web Bluetooth support)
   - HTTPS connection (or localhost for testing)
   - RFID device must support Bluetooth Low Energy (BLE)
   - Device must expose GATT service UUID: `0000fff0-0000-1000-8000-00805f9b34fb`

3. **Limitations**:
   - Web Bluetooth API has limited protocol support
   - Not all RFID reader commands may work
   - Device must use standard BLE GATT services
   - **Important**: The Android app uses a proprietary protocol (`RFIDWithUHFBLE` library). The web version provides the connection framework, but you may need to implement device-specific command protocols.

### Will My Device Work?

Your RFID device will work with Web Bluetooth if:
- ✅ It supports Bluetooth Low Energy (BLE) 
- ✅ It uses GATT services (not Classic Bluetooth)
- ✅ The service UUID matches: `0000fff0-0000-1000-8000-00805f9b34fb`
- ⚠️ You implement the device's command protocol in the `sendCommand()` and `handleNotification()` methods

If your device uses **Classic Bluetooth** (not BLE), it will NOT work with Web Bluetooth API.

## File Structure

```
.
├── index.html      # Main HTML file
├── styles.css      # CSS styling
├── app.js          # JavaScript application logic
└── README.md       # This file
```

## Technical Details

- Pure HTML/CSS/JavaScript (no frameworks required)
- Web Bluetooth API for device communication
- LocalStorage for settings and device history persistence
- Responsive design for mobile and desktop
- Modern UI with smooth animations

## Notes

- Web Bluetooth API requires HTTPS (or localhost) to work
- Some browsers may require user permission for Bluetooth access
- The application simulates RFID operations when Web Bluetooth is not available
- All settings and device history are stored locally in the browser

## License

This is a converted version of an Android RFID reader application for web use.

