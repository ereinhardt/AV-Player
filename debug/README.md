# UDP Test Sender für Save-a-Dying-Bird Mod

Diese Scripts simulieren einen Raspberry Pi, der zufällige Float-Werte über das Netzwerk sendet, um die UDP-Integration des Save-a-Dying-Bird Mods zu testen.

## Verfügbare Test-Scripts

### 1. Node.js Version (`udp-test-sender.js`)
**Features:**
- UDP Broadcast
- WebSocket Server (für Browser-Kompatibilität)
- HTTP Server (für Polling-Fallback)
- Erweiterte Fehlerbehandlung

**Installation:**
```bash
cd debug
npm install ws dgram
```

**Ausführung:**
```bash
node udp-test-sender.js
```

### 2. Python Version (`udp-test-sender.py`)
**Features:**
- UDP Broadcast  
- HTTP Server (für Polling-Fallback)
- Einfacher und leichtgewichtig

**Ausführung:**
```bash
cd debug
python3 udp-test-sender.py
```

## Konfiguration

### In save-a-dying-bird.js anpassen:
```javascript
// UDP Configuration - ändern Sie IP und Port hier
const UDP_IP = "192.168.1.100"; // IP Ihres Raspberry Pi
const UDP_PORT = 9999; // Port des Raspberry Pi
```

### Für lokale Tests:
```javascript
const UDP_IP = "127.0.0.1"; // Localhost für Tests
const UDP_PORT = 9999;
```

## Funktionsweise

1. **Start des Test-Senders:** Führen Sie eines der Scripts aus
2. **Aktivieren des Mods:** Aktivieren Sie die "Dying Bird" Checkbox in der Web-App
3. **Automatische Reaktion:** Die Random-Volume-Funktion wird nur ausgeführt, wenn sich die Float-Werte ändern

## Verbindungsarten

Das modifizierte Script unterstützt mehrere Verbindungsarten:

1. **WebSocket** (bevorzugt): Direkte Verbindung für Echtzeit-Updates
2. **HTTP Polling** (Fallback): Regelmäßige Abfrage der Werte  
3. **Zeit-basiert** (Fallback): Falls keine UDP-Verbindung möglich

## Raspberry Pi Setup

Für den echten Raspberry Pi können Sie das Python-Script als Basis verwenden:

```python
# Beispiel für kontinuierliche Sensor-Daten
import time
import socket

def send_sensor_value(value):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(str(value).encode(), ('255.255.255.255', 9999))
    sock.close()

# Ihre Sensor-Logik hier
while True:
    sensor_value = read_your_sensor()  # Implementieren Sie Ihre Sensor-Logik
    send_sensor_value(sensor_value)
    time.sleep(0.1)  # Anpassbare Frequenz
```

## Troubleshooting

- **Keine Verbindung:** Überprüfen Sie IP und Port in der Konfiguration
- **Firewall:** Stellen Sie sicher, dass die Ports nicht blockiert sind
- **Netzwerk:** Beide Geräte müssen im selben Netzwerk sein
- **Browser-Konsole:** Überprüfen Sie die Console-Logs für Verbindungsdetails