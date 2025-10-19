# Save a Dying Bird - UDP Trigger Mode

## Übersicht

Das "Save a Dying Bird" Modul wurde erweitert, um die Volume-Randomisierung durch UDP Float-Werte zu triggern, anstatt sie in festen Zeitintervallen auszuführen.

## Konfiguration

Öffnen Sie die Datei `Mods/save-a-dying-bird.js` und passen Sie folgende Werte an:

```javascript
// UDP Configuration - set your Raspberry Pi IP and Port here
const UDP_IP = "127.0.0.1";     // IP-Adresse des Raspberry Pi
const UDP_PORT = 9999;           // UDP-Port
const UDP_ENABLED = true;        // true = UDP-Modus, false = Timer-Modus
```

### Parameter:

- **UDP_IP**: Die IP-Adresse des Geräts (z.B. Raspberry Pi), das die Float-Werte sendet
- **UDP_PORT**: Der UDP-Port, auf dem die Float-Werte empfangen werden
- **UDP_ENABLED**: 
  - `true`: Volume-Randomisierung wird nur bei Änderungen der UDP-Werte ausgelöst
  - `false`: Standard-Modus mit festem Zeitintervall

## Funktionsweise

### UDP-Modus (UDP_ENABLED = true)

1. Das Modul verbindet sich mit dem WebSocket-Server
2. Es abonniert UDP Float-Werte vom konfigurierten IP:Port
3. Bei jeder **Änderung** des empfangenen Float-Wertes wird eine neue Volume-Randomisierung getriggert
4. Die Animation läuft kontinuierlich und interpoliert zwischen den Werten

### Timer-Modus (UDP_ENABLED = false)

- Standard-Verhalten: Volume-Randomisierung erfolgt alle `INTERVAL` Millisekunden (Standard: 1000ms)

## Test-Script

### Verwendung des Test-Senders

Im `debug`-Ordner befindet sich das Test-Script `udp-float-test-sender.js`, das zufällige Float-Werte per UDP sendet.

#### Starten des Test-Senders:

```bash
cd debug
node udp-float-test-sender.js [IP] [Port] [Interval]
```

**Beispiele:**

```bash
# Standard: localhost:9999, alle 3 Sekunden
node udp-float-test-sender.js

# Eigene IP und Port
node udp-float-test-sender.js 192.168.1.100 9999

# Mit eigenem Interval (in Millisekunden)
node udp-float-test-sender.js 127.0.0.1 9999 5000
```

**Parameter:**
- `IP`: Ziel-IP-Adresse (Standard: 127.0.0.1)
- `Port`: Ziel-UDP-Port (Standard: 9999)
- `Interval`: Zeit zwischen den Nachrichten in ms (Standard: 3000)

### Output des Test-Senders:

```
═══════════════════════════════════════════════════════
  UDP Float Test Sender
═══════════════════════════════════════════════════════
  Target IP:   127.0.0.1
  Target Port: 9999
  Interval:    3000ms
  Value Range: 0.0 - 1.0
═══════════════════════════════════════════════════════
  Press Ctrl+C to stop

Starting to send random floats...

[14:23:45] #1: 0.752341
[14:23:48] #2: 0.234567 (Δ -0.5177)
[14:23:51] #3: 0.891234 (Δ 0.6567)
```

## Workflow

1. **Server starten:**
   ```bash
   node server.js
   ```

2. **Konfiguration anpassen** in `Mods/save-a-dying-bird.js`

3. **Browser öffnen:**
   ```
   http://localhost:3001
   ```

4. **"Dying Bird" Checkbox aktivieren** in der Web-UI

5. **Test-Sender starten** (in neuem Terminal):
   ```bash
   cd debug
   node udp-float-test-sender.js
   ```

6. **Beobachten:** Bei jeder Änderung des UDP-Wertes werden die Volumes neu randomisiert

## Debugging

Die Console-Ausgabe im Browser zeigt:

```
[Dying Bird] Starting in UDP trigger mode
[Dying Bird] UDP listener connected
[Dying Bird] UDP value changed: null -> 0.752341
[Dying Bird] UDP value changed: 0.752341 -> 0.234567
```

## Raspberry Pi Integration

Auf dem Raspberry Pi muss ein Programm laufen, das Float-Werte per UDP sendet:

**Python-Beispiel:**

```python
import socket
import time

UDP_IP = "192.168.1.100"  # IP des AV-Players
UDP_PORT = 9999

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

while True:
    value = get_sensor_value()  # Ihre Sensor-Daten
    message = str(value).encode()
    sock.sendto(message, (UDP_IP, UDP_PORT))
    time.sleep(0.1)
```

## Hinweise

- **Netzwerk:** Stellen Sie sicher, dass der Raspberry Pi und der AV-Player im gleichen Netzwerk sind
- **Firewall:** Port 9999 (oder Ihr gewählter Port) muss offen sein
- **Performance:** Das Modul reagiert nur auf **Änderungen** der Werte, nicht auf jeden UDP-Packet
- **Kein UI-Change:** Alle Einstellungen werden im Script vorgenommen, die Web-UI bleibt unverändert
