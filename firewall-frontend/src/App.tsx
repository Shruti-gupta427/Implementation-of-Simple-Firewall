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
  deviceCtx: string | null; 
  protocol: string;
  direction: "INBOUND" | "OUTBOUND";
  createdAt: number;
};

type BackendRule = {
  ip_address: string;
  port: number | null;
  protocol: string;
  direction: string;
};

type BackendLog = {
  ip_address: string;
  action: string;
  timestamp: string;
};

type DeviceNode = {
  ip: string;
  name: string;
  lastSeen: number;
};

type ConnectionMode = "connecting" | "ws" | "polling" | "offline";

function inferDeviceFromText(text: string): DeviceType {
  const value = text.toUpperCase();
  if (value.includes("PHONE") || value.includes("HOTSPOT")) {
    return "PHONE";
  }
  return "LAPTOP";
}

function getBezierXY(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t;
  return (mt * mt * mt * p0) + (3 * mt * mt * t * p1) + (3 * mt * t * t * p2) + (t * t * t * p3);
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
  const [ruleDirection, setRuleDirection] = useState("ANY");
  
  const [ruleMessage, setRuleMessage] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);
  
  const [allowedCount, setAllowedCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  
  const [phones, setPhones] = useState<DeviceNode[]>([]);
  
  const laptopIps = useRef<Set<string>>(new Set());
  const nextId = useRef(1);
  const seenLogKeys = useRef(new Set<string>());
  const apiBase = "http://127.0.0.1:5000";

  const toFirewallMs = 1200;
  const blockedShakeMs = 500;
  const toServerMs = 1100;

  const appendLog = (text: string) => {
    setLogs((prev) => [...prev.slice(-59), { id: Date.now() + Math.random(), text }]);
  };

  const spawnPacket = (blocked: boolean, deviceCtx: string | null, protocol: string, direction: "INBOUND" | "OUTBOUND") => {
    const id = nextId.current++;
    setPackets((prev) => [...prev, { id, blocked, deviceCtx, protocol, direction, createdAt: Date.now() }]);
    if (blocked) {
      setBlockedCount((prev) => prev + 1);
    } else {
      setAllowedCount((prev) => prev + 1);
    }
  };

  const processPayload = (payload: BackendMessage, textFallback: string) => {
    const action = String(payload.status ?? textFallback).toUpperCase();
    const blocked = action.includes("BLOCKED");
    
    const protocol = payload.protocol || (textFallback.match(/\b(TCP|UDP|ICMP|DNS|HTTP|HTTPS|SMTP)\b/)?.[1] ?? "PKT");
    const device = payload.device || inferDeviceFromText(action);
    const source = payload.source_ip || "?";
    const dest = payload.destination_ip || "?";
    
    let animDirection: "INBOUND" | "OUTBOUND" = "INBOUND";
    let connectedIp: string | null = null;

    const host_ips = (payload.host_ips as string[]) || [];
    host_ips.forEach((ip: string) => laptopIps.current.add(ip));

    const isSrcPrivate = source.startsWith("192.") || source.startsWith("10.") || source.startsWith("172.");
    const isDstPrivate = dest.startsWith("192.") || dest.startsWith("10.") || dest.startsWith("172.");

    if (device === "LAPTOP") {
       if (laptopIps.current.has(source) || (!laptopIps.current.has(dest) && isSrcPrivate)) animDirection = "OUTBOUND";
       else animDirection = "INBOUND";
    } else {
       // PHONE Context
       if (isSrcPrivate && !laptopIps.current.has(source) && !source.endsWith(".1")) connectedIp = source;
       else if (isDstPrivate && !laptopIps.current.has(dest) && !dest.endsWith(".1")) connectedIp = dest;
       
       if (connectedIp) {
           animDirection = (source === connectedIp) ? "OUTBOUND" : "INBOUND";
           
           setPhones(prev => {
               const nowTime = Date.now();
               const idx = prev.findIndex(p => p.ip === connectedIp);
               if (idx > -1) {
                   const next = [...prev];
                   next[idx].lastSeen = nowTime;
                   return next;
               }
               if (prev.length >= 5) return prev; 
               return [...prev, { ip: connectedIp!, name: `Phone ${prev.length + 1}`, lastSeen: nowTime }];
           });
       }
    }

    spawnPacket(blocked, connectedIp, protocol, animDirection);
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

        const isBlocked = item.action.toUpperCase().includes("BLOCKED");
        const protocol = item.action.match(/\b(TCP|UDP|ICMP|DNS|HTTP|HTTPS|SMTP)\b/)?.[1] ?? "PKT";
        
        const line = `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.action} ${item.ip_address}`;
        appendLog(line);

        spawnPacket(isBlocked, null, protocol, "INBOUND");
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
        body: JSON.stringify({ ip, port: parsedPort, protocol: ruleProtocol, direction: ruleDirection }),
      });
      const data = (await res.json()) as { status?: string; message?: string; rule?: string };
      if (data.status === "success") {
        setRuleMessage(`SUCCESS: ${data.rule ?? "Rule added."}`);
        setRuleIp("");
        setRulePort("");
        setRuleProtocol("ANY");
        setRuleDirection("ANY");
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
        processPayload(payload, "");
        const label = payload.status === "BLOCKED" ? "BLOCKED" : "ALLOWED";
        appendLog(`[${new Date().toLocaleTimeString()}] ${label} ${payload.protocol ?? "PKT"} ${payload.source_ip ?? "?"} -> ${payload.destination_ip ?? "?"} (${payload.device || "?"})`);
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
      
      // ✨ Disconnect devices gracefully if inactive for > 15s
      setPhones((prev) => {
          const active = prev.filter(p => tickNow - p.lastSeen < 15000);
          if (active.length !== prev.length) return active;
          return prev;
      });
      
    }, 33);
    return () => window.clearInterval(interval);
  }, []);

  const visibleLogs = useMemo(() => logs.slice(-18), [logs]);

  // Layout calculations
  const cloud = { x: 12, y: 50 };
  const firewall = { x: 45, y: 50 };
  const laptopY = phones.length === 0 ? 50 : 25;
  const getPhoneY = (idx: number) => {
    if (phones.length === 1) return 65;
    const step = 45 / (phones.length - 1);
    return 45 + (idx * step);
  }

  const renderCurve = (startX: number, startY: number, endX: number, endY: number) => {
      const cx1 = startX + (endX - startX) * 0.5;
      const cy1 = startY;
      const cx2 = startX + (endX - startX) * 0.5;
      const cy2 = endY;
      return `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;
  }

  const packetViews = useMemo(() => {
    return packets.map((packet) => {
      const age = now - packet.createdAt;
      
      let targetX = 84;
      let targetY = laptopY;
      
      if (packet.deviceCtx) {
         const pIdx = phones.findIndex(p => p.ip === packet.deviceCtx);
         if (pIdx > -1) targetY = getPhoneY(pIdx);
      }

      let startX = cloud.x;
      let startY = cloud.y;
      let midX = firewall.x;
      let midY = firewall.y;
      let endX = targetX;
      let endY = targetY;

      if (packet.direction === "OUTBOUND") {
         startX = targetX;
         startY = targetY;
         endX = cloud.x;
         endY = cloud.y;
      }

      let x = cloud.x;
      let y = cloud.y;
      let color = "#f59e0b"; // Orange fallback
      let opacity = 1;
      let phase: "ingress" | "blocked" | "allowed" = "ingress";
      let scale = 1;

      if (age <= toFirewallMs) {
        const t = age / toFirewallMs;
        const cx1 = startX + (midX - startX) * 0.5;
        const cy1 = startY;
        const cx2 = startX + (midX - startX) * 0.5;
        const cy2 = midY;
        
        x = getBezierXY(t, startX, cx1, cx2, midX);
        y = getBezierXY(t, startY, cy1, cy2, midY);
        color = "#38bdf8"; // Cyber Blue
        scale = 1 + (t * 0.2); // grows slightly

      } else if (packet.blocked) {
        const s = (age - toFirewallMs) / blockedShakeMs;
        x = midX + Math.sin(age * 0.055) * 0.9;
        y = midY + Math.cos(age * 0.08) * 0.9;
        color = "#ef4444"; // Red explosion
        opacity = 1 - Math.min(1, s);
        phase = "blocked";
      } else {
        const t = Math.min(1, (age - toFirewallMs) / toServerMs);
        const cx1 = midX + (endX - midX) * 0.5;
        const cy1 = midY;
        const cx2 = midX + (endX - midX) * 0.5;
        const cy2 = endY;
        
        x = getBezierXY(t, midX, cx1, cx2, endX);
        y = getBezierXY(t, midY, cy1, cy2, endY);
        color = "#10b981"; // Emerald Green
        phase = "allowed";
        scale = 1.2 - (t * 0.2); // shrinks slightly
      }

      return {
        id: packet.id, x, y, color, opacity, phase, scale, label: packet.protocol.slice(0, 5),
      };
    });
  }, [now, packets, phones, laptopY]);

  const firewallUnderAttack = packetViews.some((packet) => packet.phase === "blocked" && packet.opacity > 0.1);

  return (
    <div className="app">
      <section className="network-panel">
        <div className="network-header">
          <span>Simple Firewall Core</span>
          <span className={`status-badge status-${connectionMode}`}>
            Backend: {connectionMode.toUpperCase()}
          </span>
        </div>
        <div className="stats-strip">
          <div className="stat-chip">Allowed: {allowedCount}</div>
          <div className="stat-chip">Blocked: {blockedCount}</div>
          <div className="stat-chip">Active Sub-nodes: {phones.length}</div>
        </div>

        <div className="diagram">
          {/* ✨ Smooth Bezier Curves rendering active paths */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <path d={renderCurve(cloud.x, cloud.y, firewall.x, firewall.y)} fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="3" strokeDasharray="6 4" strokeLinecap="round" />
            <path d={renderCurve(firewall.x, firewall.y, 84, laptopY)} fill="none" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="2.5" />
            
            {phones.map((phone, idx) => (
              <path key={phone.ip} d={renderCurve(firewall.x, firewall.y, 84, getPhoneY(idx))} fill="none" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="2.5" />
            ))}
          </svg>

          <div className="node node--cloud">Internet</div>
          <div className={`node node--firewall ${firewallUnderAttack ? "node--firewall-hit" : ""}`}>FW-01</div>
          
          <div className="node node--server node--laptop" style={{ top: `${laptopY}%`, backgroundColor: "rgba(56, 189, 248, 0.2)", borderColor: "rgba(56, 189, 248, 0.5)" }}>
            <div style={{ fontSize: "11px", opacity: 0.8 }}>Local Host</div>
            <div>Laptop</div>
          </div>

          {phones.map((phone, idx) => (
            <div key={phone.ip} className="node node--server node--phone" style={{ top: `${getPhoneY(idx)}%`, backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.4)" }}>
              <div style={{ fontSize: "11px", opacity: 0.8 }}>{phone.ip}</div>
              <div>{phone.name}</div>
            </div>
          ))}

          {packetViews.map((packet) => (
            <div
              key={packet.id}
              className={`packet packet--${packet.phase}`}
              style={{
                left: `${packet.x}%`, top: `${packet.y}%`,
                backgroundColor: packet.color, 
                opacity: packet.opacity,
                transform: `translate(-50%, -50%) scale(${packet.scale})`,
                boxShadow: `0 0 16px ${packet.color}`
              }}
            >
              <span className="packet-label" style={{ color: packet.color }}>{packet.label}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="live-log">
        <h2>Live Log</h2>
        <div className="live-log__meta">Blocked Rules: {blockedRuleCount}</div>
        <div className="live-log__content">
          {visibleLogs.length === 0 ? (
            <div className="live-log__empty">Waiting for validation logs or firewall alerts...</div>
          ) : (
            visibleLogs.map((line) => <div key={line.id} className="live-log__line">{line.text}</div>)
          )}
        </div>
        <div className="rule-panel">
          <h3 className="rule-panel__title">Rule Dashboard</h3>
          <form className="rule-form" onSubmit={submitRule}>
            <input className="rule-input" placeholder="IP or subnet (e.g. 1.1.1.1 or 10.0.0.0/24)" value={ruleIp} onChange={(e) => setRuleIp(e.target.value)} disabled={ruleBusy} />
            <input className="rule-input" placeholder="Port (empty = ALL)" value={rulePort} onChange={(e) => setRulePort(e.target.value)} disabled={ruleBusy} />
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <select className="rule-input" value={ruleProtocol} onChange={(e) => setRuleProtocol(e.target.value)} disabled={ruleBusy}>
                <option value="ANY">PROTO: ANY</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ICMP">ICMP</option>
              </select>
              
              <select className="rule-input" value={ruleDirection} onChange={(e) => setRuleDirection(e.target.value)} disabled={ruleBusy}>
                <option value="ANY">DIR: ANY</option>
                <option value="INBOUND">DIR: INBOUND</option>
                <option value="OUTBOUND">DIR: OUTBOUND</option>
              </select>
            </div>

            <button className="rule-btn" type="submit" disabled={ruleBusy}>Add Rule</button>
          </form>
          {ruleMessage ? <div className="rule-message">{ruleMessage}</div> : null}
          <div className="rules-table">
            <div className="rules-head">
              <span>IP/Subnet</span><span>Port</span><span>Proto</span><span>Dir</span><span></span>
            </div>
            {rules.length === 0 ? (
              <div className="rules-empty">No active rules.</div>
            ) : (
              rules.map((rule, idx) => (
                <div className="rules-row" style={{ gridTemplateColumns: "1.2fr 0.6fr 0.6fr 0.8fr 0.8fr" }} key={`${rule.ip_address}-${rule.port ?? "ALL"}-${rule.protocol}-${idx}`}>
                  <span title={rule.ip_address}>{rule.ip_address.length > 12 ? rule.ip_address.slice(0, 10)+'..' : rule.ip_address}</span>
                  <span>{rule.port ?? "ALL"}</span><span>{rule.protocol}</span><span>{rule.direction}</span>
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