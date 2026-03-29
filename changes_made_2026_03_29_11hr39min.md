# Python Dynamic Firewall & Network Sniffer

This branch introduces significant performance upgrades and edge-case resolutions to the core firewall engine. We transformed the script from a basic packet-dropper into a multi-threaded, dynamically updating firewall capable of handling complex Windows routing (like NAT and Hotspots).

## 🚀 New Features

* **Dynamic IP Blocking:** Integrated a FastAPI backend (`app.py`) and an interactive console (`add_ip.py`) to add blocked IPs in real-time without restarting the firewall.
* **Multi-Threading Architecture:** Separated the API-polling logic from the packet-sniffing loop. The firewall now checks for new blocked IPs via a background thread, ensuring zero latency in the main packet stream.
* **Multi-Layer Network Protection:** Upgraded the sniffer to intercept traffic at multiple kernel layers simultaneously, protecting both the host machine and connected hotspot devices.

---

## 🛠️ Technical Challenges & Resolutions

During development, we encountered several advanced networking quirks within the Windows OS. Here is how we engineered around them:

### 1. The "Self-Inflicted DoS" (Main Thread Blocking)
* **The Problem:** Initially, querying the FastAPI server for blocked IPs inside the main packet loop caused massive bottlenecking. The network queue filled up instantly, dropping all packets and shutting down the host's internet.
* **The Fix:** Moved the API `requests.get()` call to a dedicated `daemon` background thread that updates a shared memory list every second. The packet loop now checks this local memory instantly (`O(1)` time complexity).

### 2. Network Adapter Shifts (`WinError 87`)
* **The Problem:** Toggling the Windows Mobile Hotspot dynamically altered the system's routing tables. If the firewall was holding a packet when the virtual adapter initialized, re-injecting it (`network_tap.send(packet)`) caused an `OSError: [WinError 87] The parameter is incorrect` and crashed the script.
* **The Fix:** Implemented a "shock absorber" `try...except` block around the packet reinjection to gracefully ignore transient OS-level adapter shifts.

### 3. The Hotspot NAT Bypass
* **The Problem:** Pings from the host machine were blocked, but devices connected via the Mobile Hotspot bypassed the firewall entirely. This occurred because Windows Internet Connection Sharing (ICS) processes forwarded packets at a different kernel layer than standard endpoint traffic.
* **The Fix:** Upgraded the engine to dual-wield packet sniffers. We now spawn two concurrent worker threads:
    * `pydivert.Layer.NETWORK` (Protects the host/endpoint).
    * `pydivert.Layer.NETWORK_FORWARD` (Protects devices routed through the Hotspot).

### 4. Pre-NAT/Post-NAT Duplication & Cache Collisions
* **The Problem:** Because the hotspot thread intercepts packets at the routing layer, a single ping from a connected phone generated two packets: one with the phone's private IP, and one post-NAT with the laptop's IP. Additionally, our log-debouncing cache was shared between threads, causing them to accidentally silence each other's logs (a race condition).
* **The Fix:** Implemented layer-specific cache keys (e.g., `[HOTSPOT]-IP-IP` vs `[LOCAL]-IP-IP`). This correctly logs both the Pre-NAT and Post-NAT lifecycle of routed packets without spamming the console.

---

## ⚙️ How to Run

You will need three terminal windows:

1. **Start the API Server** (Normal privileges)
   ```bash
   python app.py
   ```
2. **Start the Firewall Engine** (⚠️ **Must be Administrator**)
   ```bash
   python engine.py
   ```
3. **Manage Blocked IPs** (Normal privileges)
   ```bash
   python add_ip.py
   ```
