# Mobile Setup Guide - iOS & Android

This guide explains how to use the RFID Scanner app on iOS and Android devices.

## ✅ Quick Answer: It Works on Mobile!

The RFID Scanner app now supports **both iOS and Android** through two connection methods:

1. **Web Bluetooth (Direct)** - Works on Android Chrome/Edge/Opera
2. **WebSocket Bridge** - Works on ALL mobile browsers including iOS Safari! 🎉

---

## 📱 Android Setup

### Option 1: Direct Web Bluetooth (Easiest)

1. **Use Chrome, Edge, or Opera browser** on Android
2. Open the RFID Scanner app (hosted on Vercel)
3. Click "Connect" → Select "Web Bluetooth (Direct)"
4. Click "Scan for Devices"
5. Select your RFID reader from the list
6. You're connected! ✅

### Option 2: WebSocket Bridge

1. Set up a bridge server on your computer (see WebSocket Bridge setup)
2. Use any browser on Android
3. Select "WebSocket Bridge" connection method
4. Enter bridge URL (e.g., `ws://192.168.1.100:8080`)
5. Connect!

---

## 🍎 iOS Setup

iOS Safari doesn't support Web Bluetooth, but you have two options:

### Option 1: WebSocket Bridge (Recommended for iOS)

1. **Set up bridge server** on your computer:
   ```bash
   # Install Python dependencies
   pip install websockets bleak
   
   # Run bridge server (download bridge_server.py from project)
   python bridge_server.py
   ```

2. **Find your computer's IP address:**
   - Mac/Linux: `ifconfig | grep "inet "`
   - Windows: `ipconfig`
   - Look for something like `192.168.1.100`

3. **On your iPhone/iPad:**
   - Open Safari (or any browser)
   - Go to the RFID Scanner app URL
   - Click "Connect" → Select **"WebSocket Bridge"**
   - Enter: `ws://YOUR_COMPUTER_IP:8080` (e.g., `ws://192.168.1.100:8080`)
   - Make sure your phone and computer are on the **same Wi-Fi network**
   - Click "Connect to Bridge"
   - You're connected! ✅

### Option 2: Use Chrome or Edge on iOS

1. Download **Chrome** or **Edge** from the App Store
2. Open the RFID Scanner app in Chrome/Edge
3. Web Bluetooth works in Chrome/Edge on iOS (but not Safari)
4. Use "Web Bluetooth (Direct)" connection method

---

## 📲 Installing as PWA (Progressive Web App)

You can install the app on your home screen for easy access!

### Android (Chrome)

1. Open the app in Chrome
2. Tap the menu (3 dots) → **"Add to Home screen"**
3. Name it "RFID Reader"
4. Tap "Add"
5. App icon appears on your home screen! 🎯

### iOS (Safari)

1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it "RFID Reader"
5. Tap "Add"
6. App icon appears on your home screen! 🎯

---

## 🔧 WebSocket Bridge Setup (For iOS)

### Quick Setup with Python

1. **Install Python** (if not already installed)
   - Download from: https://www.python.org/

2. **Install dependencies:**
   ```bash
   pip install websockets bleak
   ```

3. **Create bridge server file** (`bridge_server.py`):
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
           
           # Connect to RFID device
           if devices:
               client = BleakClient(devices[0])
               await client.connect()
               print("Connected to RFID device")
               
               # Enable notifications
               await client.start_notify(CHARACTERISTIC_UUID, 
                   lambda sender, data: asyncio.create_task(
                       websocket.send(data.tobytes())
                   ))
               
               # Handle commands from web app
               async for message in websocket:
                   if isinstance(message, bytes):
                       await client.write_gatt_char(CHARACTERISTIC_UUID, message)
       except Exception as e:
           print(f"Error: {e}")
       finally:
           if client:
               await client.disconnect()
           print("Web client disconnected")

   start_server = websockets.serve(handle_client, "0.0.0.0", 8080)
   print("Bridge server running on ws://0.0.0.0:8080")
   asyncio.get_event_loop().run_until_complete(start_server)
   asyncio.get_event_loop().run_forever()
   ```

4. **Run the bridge:**
   ```bash
   python bridge_server.py
   ```

5. **Connect your RFID reader:**
   - Make sure your RFID reader is powered on
   - The bridge will scan and connect automatically

6. **Find your computer's IP:**
   - Mac: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Windows: `ipconfig` (look for IPv4 Address)
   - Linux: `hostname -I`

7. **On your phone, connect to:**
   - `ws://YOUR_COMPUTER_IP:8080`
   - Example: `ws://192.168.1.100:8080`

---

## 🌐 Network Setup for Mobile

For the WebSocket bridge to work on mobile:

1. **Same Wi-Fi Network:**
   - Your phone and computer must be on the same Wi-Fi network
   - Make sure both devices are connected to the same router

2. **Firewall:**
   - Allow port 8080 through your computer's firewall
   - On Mac: System Preferences → Security → Firewall → Allow Python
   - On Windows: Allow Python through Windows Firewall

3. **IP Address:**
   - Use your computer's local IP address (192.168.x.x)
   - Don't use `localhost` or `127.0.0.1` - that only works on the same device

---

## ✅ Troubleshooting

### "Connection Failed" on Mobile

- ✅ Check bridge server is running
- ✅ Verify phone and computer are on same Wi-Fi
- ✅ Use computer's IP address (not localhost)
- ✅ Check firewall allows port 8080
- ✅ Make sure RFID reader is connected to bridge

### "No Devices Found" on Android

- ✅ Make sure you're using Chrome, Edge, or Opera
- ✅ Enable Bluetooth on your Android device
- ✅ Make sure RFID reader is powered on and in range
- ✅ Try using WebSocket Bridge instead

### WebSocket Bridge Not Connecting

- ✅ Verify bridge server is running (`python bridge_server.py`)
- ✅ Check computer's IP address is correct
- ✅ Ensure both devices on same Wi-Fi network
- ✅ Check firewall settings
- ✅ Try `ping YOUR_COMPUTER_IP` from your phone's network settings

---

## 🎯 Summary

| Platform | Browser | Method | Status |
|----------|---------|--------|--------|
| Android | Chrome/Edge/Opera | Web Bluetooth (Direct) | ✅ Works |
| Android | Any Browser | WebSocket Bridge | ✅ Works |
| iOS | Safari | WebSocket Bridge | ✅ Works |
| iOS | Chrome/Edge | Web Bluetooth (Direct) | ✅ Works |

**Recommended for iOS:** Use WebSocket Bridge (works in Safari)
**Recommended for Android:** Use Web Bluetooth Direct (faster, simpler)

---

## 📞 Need Help?

- Check the browser console (F12 or Safari Develop menu) for error messages
- Verify your RFID reader supports Bluetooth Low Energy (BLE)
- Make sure you're using HTTPS (Vercel provides this automatically)
- See `WEBSOCKET_BRIDGE_SETUP.md` for detailed bridge setup instructions

Happy scanning! 🎉

