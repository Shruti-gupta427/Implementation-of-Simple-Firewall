This is the moment of truth! You have successfully re-engineered the database, patched the API, upgraded the CLI, and added enterprise-level subnet logic. 

Here is your exact, step-by-step playbook to run the system from scratch and prove that your Layer 4 features actually work.

### 🏁 Phase 1: Spin Up the Infrastructure
You are going to need three separate terminal windows for this to work correctly.

**1. Start the API (Terminal 1 - Standard)**
Open a regular terminal in your project folder and start the FastAPI server:
```bash
python app.py
```
*Wait until you see `Uvicorn running on http://127.0.0.1:5000`.*

**2. Start the Firewall Engine (Terminal 2 - ADMINISTRATOR)**
This is critical: `pydivert` requires kernel-level network access. You **must** open this terminal as an Administrator (e.g., right-click PowerShell -> Run as Administrator). Navigate to your project folder and run:
```bash
python engine.py
```
*Wait until you see `Firewall is starting to work...`.*

**3. Start the Manager (Terminal 3 - Standard)**
Open one last regular terminal to interact with your system:
```bash
python add_ip.py
```

---

### 🧪 Phase 2: Inject the Rule (The Layer 4 Test)
We are going to tell the firewall to block **Web Traffic (HTTPS)** to Cloudflare, but leave everything else alone.

When your interactive manager (`add_ip.py`) prompts you, type exactly this:

1. **Enter IP or Subnet:** Type `1.1.1.1` and press Enter.
2. **Enter Port:** Type `443` and press Enter.
3. **Enter Protocol:** Type `TCP` and press Enter.

*You should see a green ✅ SUCCESS message saying the rule was added.*

---

### 🎯 Phase 3: The Verification

Now we prove that the firewall is actually reading the port and protocol, not just blindly dropping everything.

**Test A: The Web Test (Should be BLOCKED)**
1. Open your web browser (Chrome/Edge/Firefox) on Incognito otherwise browser's cache interferes.
2. Type `https://1.1.1.1` into the URL bar and hit Enter.
3. **What should happen:** The page will spin endlessly and eventually say "Site cannot be reached".
4. Look at your **Terminal 2 (engine.py)**. You should see a live alert pop up: 
   `[LOCAL] Blocked: ... -> 1.1.1.1 | because TCP_PORT_443`

**Test B: The Ping Test (Should be ALLOWED)**
1. Open a new command prompt or terminal.
2. Run this command: `ping 1.1.1.1`
3. **What should happen:** You should see successful replies (`Reply from 1.1.1.1: bytes=32 time=12ms...`). 

### Why is this awesome?
If Test A fails but Test B succeeds, it means **your Layer 4 firewall works perfectly**. It successfully identified that the browser was using TCP Port 443 and killed it, but realized the `ping` command was using ICMP and let it pass safely!

Run this sequence and let me know the results!