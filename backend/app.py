from fastapi import FastAPI, Request, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import uvicorn
import sqlite3

def get_db_connection():
    conn = sqlite3.connect('firewall.db')
    conn.row_factory = sqlite3.Row  # Allows us to access columns by name
    return conn

app = FastAPI(title="Firewall API")
# cors configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ✨ NEW: WebSocket Manager for React ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keeps the connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/log_packet")
async def log_packet(data: dict = Body(...)):
    # This receives the drop alert from engine.py and blasts it to React
    await manager.broadcast(data)
    return {"status": "broadcasted"}


@app.get("/get_list_blocked_ips")
async def get_ips():
    conn = get_db_connection()
    rows = conn.execute('SELECT ip_address, port, protocol, direction FROM firewall_rules').fetchall()
    conn.close()
    rules = []
    for row in rows:
        rules.append({
            "ip_address": row['ip_address'],
            "port": row['port'],
            "protocol": row['protocol'],
            "direction": row['direction']
        })
    return {"blocked_ips": rules}

@app.post("/block_ip")
async def block_ip(request: Request,data: dict = Body(...)):
    ip = data.get("ip")
    port = data.get("port")          
    protocol = data.get("protocol", "ANY").upper()
    direction = data.get("direction", "ANY").upper()
    if not ip:
        raise HTTPException(status_code=400, detail="No IP provided")
    
    conn = get_db_connection()
    try:
        conn.execute('''
            INSERT INTO firewall_rules (ip_address, port, protocol, direction) 
            VALUES (?, ?, ?, ?)
        ''', (ip, port, protocol, direction))
        action_msg = f"BLOCKED {direction} {protocol}:{port if port else 'ALL'}"
        conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', (ip, action_msg)) # changed logs -> system_logs
        conn.commit()
        return {"status": "success", "rule": f"{direction} {protocol} on {ip}:{port if port else 'ALL'}"}
    
    except sqlite3.IntegrityError:
        return {"status": "error", "message": "IP is already in the block list"}
    finally:
        conn.close()

# ✨ Notice the {ip:path} - This tells FastAPI to accept slashes for Subnets!
@app.delete("/unblock_ip/{ip:path}")
async def unblock_ip(ip: str):
    conn = get_db_connection()
    exists = conn.execute('SELECT * FROM firewall_rules WHERE ip_address = ?', (ip,)).fetchone()
    
    if not exists:
        conn.close()
        raise HTTPException(status_code=404, detail="IP not found in block list")
    
    conn.execute('DELETE FROM firewall_rules WHERE ip_address = ?', (ip,))
    conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', (ip, 'UNBLOCKED'))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"IP {ip} has been removed"}


@app.get("/get_logs")
async def get_logs():
    conn = get_db_connection()
    logs = conn.execute('SELECT ip_address, action, timestamp FROM system_logs ORDER BY id DESC LIMIT 100').fetchall()
    conn.close()
    return {"logs": [dict(row) for row in logs]}

# ✨ Added {ip:path} here too
@app.get("/check_ip/{ip:path}")
async def check_ip(ip: str):
    conn = get_db_connection()
    row = conn.execute('SELECT 1 FROM firewall_rules WHERE ip_address = ?', (ip,)).fetchone()
    conn.close()
    return {"ip": ip, "is_blocked": bool(row)}


@app.post("/clear_all")
async def clear_all():
    conn = get_db_connection()
    count_row = conn.execute('SELECT COUNT(*) FROM firewall_rules').fetchone()
    count = count_row[0]
    
    conn.execute('DELETE FROM firewall_rules')
    
    log_message = f"FLUSH_ALL_{count}_RULES"
    conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', ('SYSTEM', log_message))
    
    conn.commit()
    conn.close()
    
    print(f"🚨 ALERT: {count} rules cleared from active blocking by Admin")
    return {"status": "success", "message": f"Cleared {count} rules"}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)