### 📡 1. The Heavyweights (Best for ICMP Ping & DNS Testing)

These are public DNS resolvers. They are perfect for testing your `ICMP` (ping) rules and `UDP Port 53` (DNS) rules.

  * **`8.8.8.8`** and **`8.8.4.4`** (Google Public DNS)
  * **`9.9.9.9`** (Quad9 Security DNS)
  * **`208.67.222.222`** (OpenDNS / Cisco)

### 🌐 2. The Web Testers (Best for TCP 80 / 443)

If you want to test web blocking without accidentally breaking your own internet browsing, these are the gold standard.

  * **`93.184.216.34`** (`example.com`): This IP is maintained by IANA (the people who run the internet) *specifically* for testing. It supports both HTTP (Port 80) and HTTPS (Port 443).
  * **`142.250.190.46`** (https://www.google.com/search?q=Google.com): A great target to test if you can successfully block one massive site while leaving the rest of the internet open.

### 🧮 3. The Perfect Subnet Target (Testing CIDR Math)

Since you just built that awesome `/24` subnet logic, you need a cluster of IPs that live next door to each other to prove it works. Google is perfect for this.

**Try this Ultimate Subnet Test:**

1.  Block the subnet **`8.8.8.0/24`** for `ANY` protocol.
2.  Ping **`8.8.8.8`** (Google) 👉 *Should be blocked\!*
3.  Ping **`8.8.4.4`** (Google's backup) 👉 *Should succeed\!* (Because 8.8.4.4 is outside the `8.8.8.x` block).

### ⚠️ One IP to NEVER Block

Do not block **`127.0.0.1`** (Localhost).
If you add a rule blocking `127.0.0.1` or `0.0.0.0/8`, your FastAPI server will immediately lose the ability to talk to your SQLite database and your `engine.py` script, and the whole system will crash\!
