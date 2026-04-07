import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type BackendMessage = {
  status?: string;
  protocol?: string;
  source_ip?: string;
  destination_ip?: string;
  device?: string;
  service?: string;
  [key: string]: unknown;
};

type LogLine = {
  id: number;
  text: string;
};

type DeviceType = "LAPTOP" | "PHONE";

type PacketAnim = {
  id: number;
  blocked: boolean;
  device: DeviceType; 
  protocol: string;
  createdAt: number;
};

type BackendRule = {
  ip_address: string;
  port: number | null;
  protocol: string;
};

type BackendLog = {
  ip_address: string;
  action: string;
  timestamp: string;
};

type ConnectionMode = "connecting" | "ws" | "polling" | "offline";

function pickDevice(msg: BackendMessage): DeviceType {
  return String(msg.device).toUpperCase() === "PHONE" ? "PHONE" : "LAPTOP";
}

function inferDeviceFromText(text: string): DeviceType {
  const value = text.toUpperCase();
  if (value.includes("PHONE") || value.includes("HOTSPOT")) {
    return "PHONE";
  }
  return "LAPTOP";
}

function App() {
  const [packets, setPackets] = useState<PacketAnim[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [now, setNow] = useState(Date.now());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");
  const [blockedRuleCount, setBlockedRuleCount] = useState(0);
  const [rules, setRules] = useState<BackendRule[]>([]);
  const [ruleIp, setRuleIp] = useState("");
  const [rulePort, setRulePort] = useState("");
  const [ruleProtocol, setRuleProtocol] = useState("ANY");
  const [ruleMessage, setRuleMessage] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);
  
  const [allowedCount, setAllowedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  
  const [deviceHits, setDeviceHits] = useState<Record<DeviceType, number>>({
    LAPTOP: 0,
    PHONE: 0,
  });

  // ✨ NEW: State to track if the Hotspot is active
  const [isPhoneConnected, setIsPhoneConnected] = useState(false);
  
  const nextId = useRef(1);
  const seenLogKeys = useRef(new Set<string>());
  const apiBase = "http://127.0.0.1:5000";

  const toFirewallMs = 1200;
  const blockedShakeMs = 500;
  const toServerMs = 1100;

  const appendLog = (text: string) => {
    setLogs((prev) => [...prev.slice(-59), { id: Date.now() + Math.random(), text }]);
  };

  const spawnPacket = (blocked: boolean, device: DeviceType, protocol: string) => {
    const id = nextId.current++;
    setPackets((prev) => [...prev, { id, blocked, device, protocol, createdAt: Date.now() }]);
    if (blocked) {
      setBlockedCount((prev) => prev + 1);
    } else {
      setAllowedCount((prev) => prev + 1);
      setDeviceHits((prev) => ({ ...prev, [device]: prev[device] + 1 }));
    }
  };

  const syncSnapshot = async () => {
    try {
      const [rulesRes, logsRes] = await Promise.all([
        fetch(`${apiBase}/get_list_blocked_ips`),
        fetch(`${apiBase}/get_logs`),
      ]);

      if (!rulesRes.ok || !logsRes.ok) throw new Error("API snapshot failed");

      const rulesJson = (await rulesRes.json()) as { blocked_ips?: BackendRule[] };
      const logsJson = (await logsRes.json()) as { logs?: BackendLog[] };

      const rulesList = Array.isArray(rulesJson.blocked_ips) ? rulesJson.blocked_ips : [];
      setBlockedRuleCount(rulesList.length);
      setRules(rulesList);

      const serverLogs = Array.isArray(logsJson.logs) ? logsJson.logs : [];
      const ordered = [...serverLogs].reverse();
      let newCount = 0;

      for (const item of ordered) {
        const key = `${item.timestamp}|${item.ip_address}|${item.action}`;
        if (seenLogKeys.current.has(key)) continue;
        seenLogKeys.current.add(key);
        newCount += 1;

        const action = String(item.action ?? "").toUpperCase();
        const blocked = action.includes("BLOCKED");
        const device = inferDeviceFromText(action);
        
        // ✨ NEW: If we see a phone packet in the database, wake up the Phone node
        if (device === "PHONE") setIsPhoneConnected(true);

        const protoMatch = action.match(/\b(TCP|UDP|ICMP|DNS|HTTP|HTTPS|SMTP)\b/);
        const protocol = protoMatch?.[1] ?? "PKT";
        const line = `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.action} ${item.ip_address}`;
        appendLog(line);

        if (blocked) spawnPacket(true, device, protocol);
      }

      if (newCount > 0 && connectionMode !== "ws") setConnectionMode("polling");
      return true;
    } catch {
      if (connectionMode !== "ws") setConnectionMode("offline");
      return false;
    }
  };

  const submitRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ip = ruleIp.trim();
    if (!ip) return setRuleMessage("IP or subnet is required.");

    const parsedPort = rulePort.trim() === "" ? null : Number(rulePort);
    if (parsedPort !== null && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      return setRuleMessage("Port must be between 1 and 65535, or empty for ALL.");
    }

    setRuleBusy(true);
    setRuleMessage("");
    try {
      const res = await fetch(`${apiBase}/block_ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port: parsedPort, protocol: ruleProtocol }),
      });
      const data = (await res.json()) as { status?: string; message?: string; rule?: string };
      if (data.status === "success") {
        setRuleMessage(`SUCCESS: ${data.rule ?? "Rule added."}`);
        setRuleIp("");
        setRulePort("");
        setRuleProtocol("ANY");
        await syncSnapshot();
      } else {
        setRuleMessage(`NOTICE: ${data.message ?? "Failed to add rule."}`);
      }
    } catch {
      setRuleMessage("ERROR: Could not connect to the API.");
    } finally {
      setRuleBusy(false);
    }
  };

  const removeRulesByIp = async (ip: string) => {
    setRuleBusy(true);
    setRuleMessage("");
    try {
      const res = await fetch(`${apiBase}/unblock_ip/${encodeURIComponent(ip)}`, { method: "DELETE" });
      if (res.ok) {
        setRuleMessage(`SUCCESS: Removed all rules for ${ip}`);
        await syncSnapshot();
      } else if (res.status === 404) {
        setRuleMessage(`NOTICE: No rules found for ${ip}`);
      } else {
        setRuleMessage("ERROR: Could not delete rule.");
      }
    } catch {
      setRuleMessage("ERROR: Could not connect to the API.");
    } finally {
      setRuleBusy(false);
    }
  };

  useEffect(() => {
    let pollId: number | null = null;
    const ws = new WebSocket("ws://127.0.0.1:5000/ws");
    let wsConnected = false;

    ws.onopen = () => {
      wsConnected = true;
      setConnectionMode("ws");
      appendLog("[WS] Connected to ws://127.0.0.1:5000/ws");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as BackendMessage;
        const blocked = String(payload.status ?? "").toUpperCase() === "BLOCKED";
        const device = pickDevice(payload);
        
        // ✨ NEW: Instantly wake up the Phone node if a live WebSocket packet hits it
        if (device === "PHONE") setIsPhoneConnected(true);
        
        const protocol = String(payload.protocol ?? "PKT").toUpperCase();
        spawnPacket(blocked, device, protocol);

        const logText = `[${new Date().toLocaleTimeString()}] ${blocked ? "BLOCKED" : "ALLOWED"} ${payload.protocol ?? "PKT"} ${payload.source_ip ?? "?"} -> ${payload.destination_ip ?? "?"} (${device})`;
        appendLog(logText);
      } catch {
        appendLog(`[WS] Unparsed message: ${String(event.data)}`);
      }
    };

    ws.onerror = () => appendLog("[WS] Error while receiving data.");
    ws.onclose = () => {
      if (wsConnected) appendLog("[WS] Connection closed.");
      else appendLog("[WS] Endpoint unavailable, switching to REST polling.");
      setConnectionMode("polling");
      void syncSnapshot();
      pollId = window.setInterval(() => void syncSnapshot(), 2500);
    };

    void syncSnapshot();
    return () => {
      ws.close();
      if (pollId) window.clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      setNow(tickNow);
      setPackets((prev) =>
        prev.filter((packet) => {
          const age = tickNow - packet.createdAt;
          if (packet.blocked) return age <= toFirewallMs + blockedShakeMs;
          return age <= toFirewallMs + toServerMs;
        }),
      );
    }, 33);
    return () => window.clearInterval(interval);
  }, []);

  const visibleLogs = useMemo(() => logs.slice(-18), [logs]);

  const packetViews = useMemo(() => {
    const cloud = { x: 12, y: 50 };
    const firewall = { x: 45, y: 50 };
    
    // ✨ NEW: If phone is NOT connected, the Laptop Y-axis defaults to perfectly centered (50)
    const devices: Record<DeviceType, { x: number; y: number }> = {
      LAPTOP: { x: 84, y: isPhoneConnected ? 35 : 50 },
      PHONE: { x: 84, y: 65 },
    };

    return packets.map((packet) => {
      const age = now - packet.createdAt;
      const target = devices[packet.device];

      let x = cloud.x;
      let y = cloud.y;
      let color = "#f59e0b";
      let opacity = 1;
      let phase: "ingress" | "blocked" | "allowed" = "ingress";

      if (age <= toFirewallMs) {
        const t = age / toFirewallMs;
        x = cloud.x + (firewall.x - cloud.x) * t;
        y = cloud.y + (firewall.y - cloud.y) * t;
      } else if (packet.blocked) {
        const s = (age - toFirewallMs) / blockedShakeMs;
        x = firewall.x + Math.sin(age * 0.055) * 0.9;
        y = firewall.y + Math.cos(age * 0.08) * 0.9;
        color = "#ef4444";
        opacity = 1 - Math.min(1, s);
        phase = "blocked";
      } else {
        const t = Math.min(1, (age - toFirewallMs) / toServerMs);
        x = firewall.x + (target.x - firewall.x) * t;
        y = firewall.y + (target.y - firewall.y) * t;
        color = "#22c55e";
        phase = "allowed";
      }

      return {
        id: packet.id, x, y, color, opacity, phase, label: packet.protocol.slice(0, 5),
      };
    });
  }, [now, packets, isPhoneConnected]); // ✨ NEW: Added isPhoneConnected to dependency array!

  const firewallUnderAttack = packetViews.some((packet) => packet.phase === "blocked" && packet.opacity > 0.1);

  // ✨ NEW: Dynamic layout variables for seamless transitions
  const laptopTop = isPhoneConnected ? "35%" : "50%";
  const laptopRotation = isPhoneConnected ? "rotate(-10deg)" : "rotate(0deg)";

  return (
    <div className="app">
      <section className="network-panel">
        <div className="network-header">
          <span>Simple Firewall</span>
          <span className={`status-badge status-${connectionMode}`}>
            Backend: {connectionMode.toUpperCase()}
          </span>
        </div>
        <div className="stats-strip">
          <div className="stat-chip">Allowed: {allowedCount}</div>
          <div className="stat-chip">Blocked: {blockedCount}</div>
          <div className="stat-chip">Laptop Hits: {deviceHits.LAPTOP}</div>
          {isPhoneConnected && <div className="stat-chip">Phone Hits: {deviceHits.PHONE}</div>}
        </div>

        <div className="diagram">
          <div className="node node--cloud">Internet</div>
          <div className={`node node--firewall ${firewallUnderAttack ? "node--firewall-hit" : ""}`}>Firewall</div>
          
          <div 
            className="node node--server node--laptop" 
            style={{ 
              top: laptopTop, 
              backgroundColor: "rgba(56, 189, 248, 0.2)",
              transition: "top 0.5s ease-in-out" // Gives it a smooth sliding animation!
            }}
          >
            Laptop (Local)
          </div>

          {/* ✨ NEW: Phone conditionally renders */}
          {isPhoneConnected && (
            <div className="node node--server node--phone" style={{ top: "65%", backgroundColor: "rgba(52, 211, 153, 0.2)" }}>
              Phone (Hotspot)
            </div>
          )}

          <div className="link link--cloud-fw" />
          
          <div 
            className="link link--fw-laptop" 
            style={{ 
              left: "49%", top: "50%", width: "37%", 
              transform: laptopRotation,
              transition: "transform 0.5s ease-in-out" 
            }} 
          />

          {isPhoneConnected && (
            <div className="link link--fw-phone" style={{ left: "49%", top: "50%", width: "37%", transform: "rotate(10deg)" }} />
          )}

          {packetViews.map((packet) => (
            <div
              key={packet.id}
              className={`packet packet--${packet.phase}`}
              style={{
                left: `${packet.x}%`, top: `${packet.y}%`,
                backgroundColor: packet.color, opacity: packet.opacity,
              }}
            >
              <span className="packet-label">{packet.label}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="live-log">
        <h2>Live Log</h2>
        <div className="live-log__meta">Blocked Rules: {blockedRuleCount}</div>
        <div className="live-log__content">
          {visibleLogs.length === 0 ? (
            <div className="live-log__empty">Waiting for packets...</div>
          ) : (
            visibleLogs.map((line) => <div key={line.id} className="live-log__line">{line.text}</div>)
          )}
        </div>
        <div className="rule-panel">
          <h3 className="rule-panel__title">Rule Dashboard</h3>
          <form className="rule-form" onSubmit={submitRule}>
            <input className="rule-input" placeholder="IP or subnet (e.g. 1.1.1.1 or 10.0.0.0/24)" value={ruleIp} onChange={(e) => setRuleIp(e.target.value)} disabled={ruleBusy} />
            <input className="rule-input" placeholder="Port (empty = ALL)" value={rulePort} onChange={(e) => setRulePort(e.target.value)} disabled={ruleBusy} />
            <select className="rule-input" value={ruleProtocol} onChange={(e) => setRuleProtocol(e.target.value)} disabled={ruleBusy}>
              <option value="ANY">ANY</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="ICMP">ICMP</option>
            </select>
            <button className="rule-btn" type="submit" disabled={ruleBusy}>Add Rule</button>
          </form>
          {ruleMessage ? <div className="rule-message">{ruleMessage}</div> : null}
          <div className="rules-table">
            <div className="rules-head">
              <span>IP / Subnet</span><span>Port</span><span>Proto</span><span>Action</span>
            </div>
            {rules.length === 0 ? (
              <div className="rules-empty">No active rules.</div>
            ) : (
              rules.map((rule, idx) => (
                <div className="rules-row" key={`${rule.ip_address}-${rule.port ?? "ALL"}-${rule.protocol}-${idx}`}>
                  <span>{rule.ip_address}</span><span>{rule.port ?? "ALL"}</span><span>{rule.protocol}</span>
                  <button className="rule-delete" type="button" onClick={() => void removeRulesByIp(rule.ip_address)} disabled={ruleBusy}>Delete</button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;