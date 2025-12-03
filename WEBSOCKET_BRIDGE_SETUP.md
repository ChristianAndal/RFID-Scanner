# WebSocket Bridge Setup Guide

## Overview

The WebSocket Bridge allows the RFID Scanner web app to work in **all browsers** (including Safari and Firefox) by using a local bridge server that handles Bluetooth communication.

## Architecture

```
[RFID Device] <--Bluetooth--> [Bridge Server] <--WebSocket--> [Web App (Any Browser)]
```

## Quick Start

### Option 1: Node.js Bridge Server (Recommended)

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/

2. **Install dependencies:**
   ```bash
   npm install ws bluetooth-serial-port
   ```

3. **Create bridge server** (`bridge-server.js`):
   ```javascript
   const WebSocket = require('ws');
   const BluetoothSerialPort = require('bluetooth-serial-port');

   const wss = new WebSocket.Server({ port: 8080 });
   const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
   const CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

   wss.on('connection', (ws) => {
       console.log('Web client connected');
       
       // Initialize Bluetooth connection
       const btSerial = new BluetoothSerialPort();
       
       ws.on('message', async (message) => {
           try {
               // Handle command from web app
               if (message instanceof Buffer) {
                   // Send to Bluetooth device
                   btSerial.write(message, (err) => {
                       if (err) console.error('Bluetooth write error:', err);
                   });
               } else {
                   const data = JSON.parse(message);
                   if (data.type === 'command') {
                       const buffer = Buffer.from(data.bytes);
                       btSerial.write(buffer, (err) => {
                           if (err) console.error('Bluetooth write error:', err);
                       });
                   }
               }
           } catch (error) {
               console.error('Error handling message:', error);
           }
       });
       
       // Forward Bluetooth data to web app
       btSerial.on('data', (buffer) => {
           ws.send(buffer);
       });
       
       ws.on('close', () => {
           console.log('Web client disconnected');
           btSerial.close();
       });
   });

   console.log('Bridge server running on ws://localhost:8080');
   ```

4. **Run the bridge server:**
   ```bash
   node bridge-server.js
   ```

5. **Connect from web app:**
   - Open the RFID Scanner web app
   - Select "WebSocket Bridge" connection method
   - Enter: `ws://localhost:8080`
   - Click "Connect to Bridge"

### Option 2: Python Bridge Server

1. **Install Python** (if not already installed)

2. **Install dependencies:**
   ```bash
   pip install websockets bleak
   ```

3. **Create bridge server** (`bridge_server.py`):
   ```python
   import asyncio
   import websockets
   import json
   from bleak import BleakClient, BleakScanner

   SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"
   CHARACTERISTIC_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"

   async def handle_client(websocket, path):
       print("Web client connected")
       client = None
       
       try:
           # Scan for devices
           devices = await BleakScanner.discover()
           print("Found devices:", [d.name for d in devices])
           
           # Connect to first RFID device (modify as needed)
           if devices:
               client = BleakClient(devices[0])
               await client.connect()
               print("Connected to device")
               
               # Enable notifications
               await client.start_notify(CHARACTERISTIC_UUID, 
                   lambda sender, data: asyncio.create_task(
                       websocket.send(data.tobytes())
                   ))
               
               # Handle commands from web app
               async for message in websocket:
                   if isinstance(message, bytes):
                       await client.write_gatt_char(CHARACTERISTIC_UUID, message)
                   else:
                       data = json.loads(message)
                       if data.get('type') == 'command':
                           await client.write_gatt_char(CHARACTERISTIC_UUID, 
                               bytes(data['bytes']))
       except Exception as e:
           print(f"Error: {e}")
       finally:
           if client:
               await client.disconnect()
           print("Web client disconnected")

   start_server = websockets.serve(handle_client, "localhost", 8080)
   print("Bridge server running on ws://localhost:8080")
   asyncio.get_event_loop().run_until_complete(start_server)
   asyncio.get_event_loop().run_forever()
   ```

4. **Run the bridge server:**
   ```bash
   python bridge_server.py
   ```

## Protocol

The bridge server should handle:

1. **Commands from web app:**
   - Binary: `Uint8Array` bytes
   - JSON: `{ type: 'command', bytes: [1,2,3,...] }`

2. **Data to web app:**
   - Binary: Send raw bytes
   - JSON: `{ type: 'data', bytes: [1,2,3,...] }`

## Testing

1. Start the bridge server
2. Open the web app in any browser
3. Select "WebSocket Bridge" connection method
4. Enter bridge URL (default: `ws://localhost:8080`)
5. Click "Connect to Bridge"
6. You should see "Connected to bridge server" message

## Troubleshooting

### "Connection Failed"
- Make sure bridge server is running
- Check firewall settings
- Verify WebSocket URL is correct
- Check bridge server console for errors

### "No data received"
- Verify Bluetooth device is connected to bridge
- Check bridge server logs
- Ensure device is sending data

### "Command not sent"
- Check bridge server is receiving messages
- Verify Bluetooth connection is active
- Check device compatibility

## Security Note

⚠️ **Important**: The bridge server runs locally and should only accept connections from localhost. For production use, add authentication and encryption.

## Browser Compatibility

✅ **Works in all browsers:**
- Chrome
- Firefox
- Safari (including iOS)
- Edge
- Opera
- Any browser with WebSocket support

This makes the RFID Scanner app accessible to users regardless of their browser choice!

