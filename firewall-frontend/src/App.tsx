import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type BackendMessage = {
  status?: string;
  protocol?: string;
  source_ip?: string;
  destination_ip?: string;
  server?: "WEB" | "EMAIL" | "DNS";
  service?: string;
  [key: string]: unknown;
};

type LogLine = {
  id: number;
  text: string;
};

type ServerType = "WEB" | "EMAIL" | "DNS";

type PacketAnim = {
  id: number;
  blocked: boolean;
  server: ServerType;
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

function pickServer(msg: BackendMessage): ServerType {
  const label = String(msg.server ?? msg.service ?? "").toUpperCase();
  if (label.includes("MAIL") || label.includes("SMTP") || label.includes("EMAIL")) {
    return "EMAIL";
  }
  if (label.includes("DNS")) {
    return "DNS";
  }
  return "WEB";
}

function inferServerFromText(text: string): ServerType {
  const value = text.toUpperCase();
  if (value.includes("SMTP") || value.includes("MAIL") || value.includes("EMAIL")) {
    return "EMAIL";
  }
  if (value.includes("DNS")) {
    return "DNS";
  }
  return "WEB";
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
  const [serverHits, setServerHits] = useState<Record<ServerType, number>>({
    WEB: 0,
    EMAIL: 0,
    DNS: 0,
  });
  const nextId = useRef(1);
  const seenLogKeys = useRef(new Set<string>());
  const apiBase = "http://127.0.0.1:5000";

  const toFirewallMs = 2300;
  const blockedShakeMs = 900;
  const toServerMs = 2100;

  const appendLog = (text: string) => {
    setLogs((prev) => [...prev.slice(-59), { id: Date.now() + Math.random(), text }]);
  };

  const spawnPacket = (blocked: boolean, server: ServerType, protocol: string) => {
    const id = nextId.current++;
    setPackets((prev) => [...prev, { id, blocked, server, protocol, createdAt: Date.now() }]);
    if (blocked) {
      setBlockedCount((prev) => prev + 1);
    } else {
      setAllowedCount((prev) => prev + 1);
      setServerHits((prev) => ({ ...prev, [server]: prev[server] + 1 }));
    }
  };

  const syncSnapshot = async () => {
    try {
      const [rulesRes, logsRes] = await Promise.all([
        fetch(`${apiBase}/get_list_blocked_ips`),
        fetch(`${apiBase}/get_logs`),
      ]);

      if (!rulesRes.ok || !logsRes.ok) {
        throw new Error("API snapshot failed");
      }

      const rulesJson = (await rulesRes.json()) as { blocked_ips?: BackendRule[] };
      const logsJson = (await logsRes.json()) as { logs?: BackendLog[] };

      const rulesList = Array.isArray(rulesJson.blocked_ips) ? rulesJson.blocked_ips : [];
      const ruleCount = rulesList.length;
      setBlockedRuleCount(ruleCount);
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
        const server = inferServerFromText(action);
        const protoMatch = action.match(/\b(TCP|UDP|ICMP|DNS|HTTP|HTTPS|SMTP)\b/);
        const protocol = protoMatch?.[1] ?? "PKT";
        const line = `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.action} ${item.ip_address}`;
        appendLog(line);

        if (blocked) {
          spawnPacket(true, server, protocol);
        }
      }

      if (newCount > 0 && connectionMode !== "ws") {
        setConnectionMode("polling");
      }
      return true;
    } catch {
      if (connectionMode !== "ws") {
        setConnectionMode("offline");
      }
      return false;
    }
  };

  const submitRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ip = ruleIp.trim();
    if (!ip) {
      setRuleMessage("IP or subnet is required.");
      return;
    }

    const parsedPort = rulePort.trim() === "" ? null : Number(rulePort);
    if (parsedPort !== null && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      setRuleMessage("Port must be between 1 and 65535, or empty for ALL.");
      return;
    }

    setRuleBusy(true);
    setRuleMessage("");
    try {
      const res = await fetch(`${apiBase}/block_ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip,
          port: parsedPort,
          protocol: ruleProtocol,
        }),
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
        const server = pickServer(payload);
        const protocol = String(payload.protocol ?? "PKT").toUpperCase();
        spawnPacket(blocked, server, protocol);

        const logText = `[${new Date().toLocaleTimeString()}] ${blocked ? "BLOCKED" : "ALLOWED"} ${payload.protocol ?? "PKT"} ${payload.source_ip ?? "?"} -> ${payload.destination_ip ?? "?"} (${server})`;
        appendLog(logText);
      } catch {
        appendLog(`[WS] Unparsed message: ${String(event.data)}`);
      }
    };

    ws.onerror = () => {
      appendLog("[WS] Error while receiving data.");
    };

    ws.onclose = () => {
      if (wsConnected) {
        appendLog("[WS] Connection closed.");
      } else {
        appendLog("[WS] Endpoint unavailable, switching to REST polling.");
      }
      setConnectionMode("polling");
      void syncSnapshot();
      pollId = window.setInterval(() => {
        void syncSnapshot();
      }, 2500);
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
          if (packet.blocked) {
            return age <= toFirewallMs + blockedShakeMs;
          }
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
    const servers: Record<ServerType, { x: number; y: number }> = {
      WEB: { x: 84, y: 26 },
      EMAIL: { x: 84, y: 50 },
      DNS: { x: 84, y: 74 },
    };

    return packets.map((packet) => {
      const age = now - packet.createdAt;
      const target = servers[packet.server];

      let x = cloud.x;
      let y = cloud.y;
      let color = "#fbbf24";
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
        color = "#34d399";
        phase = "allowed";
      }

      return {
        id: packet.id,
        x,
        y,
        color,
        opacity,
        phase,
        label: packet.protocol.slice(0, 5),
      };
    });
  }, [now, packets]);

  const firewallUnderAttack = packetViews.some((packet) => packet.phase === "blocked" && packet.opacity > 0.1);
  const serverSuccess = {
    WEB: packetViews.some((p) => p.phase === "allowed" && p.x > 82 && p.y < 33),
    EMAIL: packetViews.some((p) => p.phase === "allowed" && p.x > 82 && p.y >= 40 && p.y <= 60),
    DNS: packetViews.some((p) => p.phase === "allowed" && p.x > 82 && p.y > 67),
  };

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
          <div className="stat-chip">Web Hits: {serverHits.WEB}</div>
          <div className="stat-chip">Email Hits: {serverHits.EMAIL}</div>
          <div className="stat-chip">DNS Hits: {serverHits.DNS}</div>
        </div>

        <div className="diagram">
          <div className="node node--cloud"><span className="node-icon">🌐</span> Internet</div>
          <div className={`node node--firewall ${firewallUnderAttack ? "node--firewall-hit" : ""}`}>
            <span className="node-icon">🧱</span> Firewall
            {firewallUnderAttack ? <span className="impact-fire">🔥</span> : null}
          </div>
          <div className="node node--server node--web">
            <span className="node-icon">🖥️</span> Web Server {serverSuccess.WEB ? <span className="tick">✅</span> : null}
          </div>
          <div className="node node--server node--email">
            <span className="node-icon">📧</span> Email Server {serverSuccess.EMAIL ? <span className="tick">✅</span> : null}
          </div>
          <div className="node node--server node--dns">
            <span className="node-icon">🧭</span> DNS Server {serverSuccess.DNS ? <span className="tick">✅</span> : null}
          </div>

          <div className="link link--cloud-fw" />
          <div className="link link--fw-web" />
          <div className="link link--fw-email" />
          <div className="link link--fw-dns" />

          {packetViews.map((packet) => (
            <div
              key={packet.id}
              className={`packet packet--${packet.phase}`}
              style={{
                left: `${packet.x}%`,
                top: `${packet.y}%`,
                backgroundColor: packet.color,
                opacity: packet.opacity,
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
            visibleLogs.map((line) => (
              <div key={line.id} className="live-log__line">
                {line.text}
              </div>
            ))
          )}
        </div>
        <div className="rule-panel">
          <h3 className="rule-panel__title">Rule Dashboard</h3>
          <form className="rule-form" onSubmit={submitRule}>
            <input
              className="rule-input"
              placeholder="IP or subnet (e.g. 1.1.1.1 or 10.0.0.0/24)"
              value={ruleIp}
              onChange={(e) => setRuleIp(e.target.value)}
              disabled={ruleBusy}
            />
            <input
              className="rule-input"
              placeholder="Port (empty = ALL)"
              value={rulePort}
              onChange={(e) => setRulePort(e.target.value)}
              disabled={ruleBusy}
            />
            <select
              className="rule-input"
              value={ruleProtocol}
              onChange={(e) => setRuleProtocol(e.target.value)}
              disabled={ruleBusy}
            >
              <option value="ANY">ANY</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="ICMP">ICMP</option>
            </select>
            <button className="rule-btn" type="submit" disabled={ruleBusy}>
              Add Rule
            </button>
          </form>
          {ruleMessage ? <div className="rule-message">{ruleMessage}</div> : null}
          <div className="rules-table">
            <div className="rules-head">
              <span>IP / Subnet</span>
              <span>Port</span>
              <span>Proto</span>
              <span>Action</span>
            </div>
            {rules.length === 0 ? (
              <div className="rules-empty">No active rules.</div>
            ) : (
              rules.map((rule, idx) => (
                <div className="rules-row" key={`${rule.ip_address}-${rule.port ?? "ALL"}-${rule.protocol}-${idx}`}>
                  <span>{rule.ip_address}</span>
                  <span>{rule.port ?? "ALL"}</span>
                  <span>{rule.protocol}</span>
                  <button
                    className="rule-delete"
                    type="button"
                    onClick={() => void removeRulesByIp(rule.ip_address)}
                    disabled={ruleBusy}
                  >
                    Delete
                  </button>
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
