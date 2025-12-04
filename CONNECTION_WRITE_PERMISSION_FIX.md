# Connection & Write Permission Fix

## ❌ Problem: "GATT operation not permitted" when setting power

### What's Happening:
- ✅ **Connection is working** (you can receive data from device buttons)
- ❌ **Cannot send commands** (Set Power, etc. fail)
- Reason: The connected characteristic supports **Notify** (receiving) but not **Write** (sending)

---

## 🔧 Quick Solutions

### Solution 1: Use Device Buttons Only (Easiest)
If you only need to scan tags:
- **You're already connected!** ✅
- **Just use the buttons on your RFID device**
- Tags will appear automatically in the web app
- **No commands needed from the web app**

### Solution 2: Reconnect with Write Characteristic
If you need to send commands (Set Power, etc.):

1. **Disconnect** from the device
2. **Reconnect** - when you see the service selection screen:
3. **Look for characteristics that show**:
   - ✅ `Properties: Notify, Write` (BEST - can do both)
   - ✅ `Properties: Write` (Can send commands)
   - ❌ `Properties: Notify` (Can only receive)

4. **Select a characteristic with "Write" property**

---

## 🎯 What the App Does Now

The app now automatically:
1. **Tries to find characteristics with BOTH Notify AND Write** (best option)
2. **Tries to find separate Notify and Write characteristics**
3. **Falls back to Notify-only** (receive only, commands disabled)

---

## 📋 Connection Status Messages

- `(Full functionality)` - Can receive AND send commands ✅
- `(Separate RX/TX)` - Using separate characteristics ✅
- `(Receive only - no commands)` - Can receive but cannot send commands ⚠️

---

## 💡 Why This Happens

RFID devices often use:
- **One characteristic** for receiving data (Notify)
- **Another characteristic** for sending commands (Write)

The auto-connect might have found the "receive" one but not the "send" one.

---

## ✅ Summary

**For scanning tags using device buttons:**
- Your connection is fine! ✅
- Just use device buttons
- Tags appear automatically

**For sending commands from web app:**
- Reconnect
- Select a characteristic with "Write" property
- Or the app will automatically find one if available

---

## 🔍 How to Check

1. Open browser console (F12)
2. Look at connection status message
3. If it says "(Receive only - no commands)", you need to reconnect
4. Select a characteristic with Write property

Good luck! 🎉

