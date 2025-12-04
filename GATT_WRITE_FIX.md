# GATT Write Permission Fix

## ⚠️ Error: "GATT operation not permitted"

This error means the connected characteristic **doesn't support write operations**. You can receive data but cannot send commands.

---

## 🔧 Solution

### Option 1: Reconnect and Select Correct Characteristic

1. **Disconnect** from the device
2. **Reconnect** and when you see the service selection screen:
3. **Look for a characteristic that shows**:
   - `Properties: Notify, Write` ✅ (Best - can do both)
   - `Properties: Write` ✅ (Can send commands)
   - `Properties: Notify` ❌ (Can only receive, cannot send)

4. **Select a characteristic with "Write" property** if you need to send commands

### Option 2: Use Device Buttons Only

If you only need to **receive data** from device buttons:
- You're already connected! ✅
- Just use the buttons on your RFID device
- Tags will appear automatically
- You don't need to send commands from the web app

---

## 📋 How to Check

1. Open browser console (F12)
2. Look at the connection logs
3. You'll see: `Properties: { notify: true, write: false }`
4. If `write: false`, that's the problem!

---

## 🎯 Quick Fix

**For receiving tag data only (device buttons):**
- Current connection is fine ✅
- Don't try to set power/commands
- Just scan tags using device buttons

**For sending commands (like Set Power):**
- Reconnect
- Select a characteristic with "Write" property
- Or find one with both "Notify, Write"

---

## 💡 Why This Happens

RFID devices sometimes use:
- **One characteristic** for receiving (Notify)
- **Different characteristic** for sending (Write)

The auto-connect found the "receive" one, but not the "send" one.

Good news: The app will now automatically find BOTH if they exist! 🎉

