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

  const toFirewallMs = 1200;
  const blockedShakeMs = 500;
  const toServerMs = 1100;

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

      const ruleCount = Array.isArray(rulesJson.blocked_ips) ? rulesJson.blocked_ips.length : 0;
      setBlockedRuleCount(ruleCount);

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
          <div className="node node--cloud">Internet</div>
          <div className={`node node--firewall ${firewallUnderAttack ? "node--firewall-hit" : ""}`}>Firewall</div>
          <div className="node node--server node--web">Web Server</div>
          <div className="node node--server node--email">Email Server</div>
          <div className="node node--server node--dns">DNS Server</div>

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
      </aside>
    </div>
  );
}

export default App;
