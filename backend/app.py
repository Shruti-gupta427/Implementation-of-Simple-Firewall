from fastapi import FastAPI, Request, HTTPException, Body
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

@app.get("/get_list_blocked_ips")
async def get_ips():
    conn = get_db_connection()
    rows = conn.execute('SELECT ip_address FROM blocked_ips').fetchall()
    conn.close()
    return {"blocked_ips": [row['ip_address'] for row in rows]}

@app.post("/block_ip")
async def block_ip(request: Request,data: dict = Body(...)):
    ip = data.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="No IP provided")
    
    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO blocked_ips (ip_address) VALUES (?)', (ip,))
        conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', (ip, 'BLOCKED'))
        conn.commit()
        print(f"BLOCKED: {ip}")
        return {"status": "success", "blocked": ip}
    except sqlite3.IntegrityError:
        return {"status": "error", "message": "IP is already in the block list"}
    finally:
        conn.close()

@app.delete("/unblock_ip/{ip}")
async def unblock_ip(ip: str):
    conn = get_db_connection()
    # Check if it actually exists first
    exists = conn.execute('SELECT * FROM blocked_ips WHERE ip_address = ?', (ip,)).fetchone()
    
    if not exists:
        conn.close()
        raise HTTPException(status_code=404, detail="IP not found in block list")
    
    conn.execute('DELETE FROM blocked_ips WHERE ip_address = ?', (ip,))
    conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', (ip, 'UNBLOCKED'))
    conn.commit()
    conn.close()
    print(f"UNBLOCKED: {ip}")
    return {"status": "success", "message": f"IP {ip} has been removed"}

@app.get("/get_logs")
async def get_logs():
    conn = get_db_connection()
    logs = conn.execute('SELECT ip_address, action, timestamp FROM system_logs ORDER BY id DESC LIMIT 100').fetchall()
    conn.close()
    return {"logs": [dict(row) for row in logs]}

@app.get("/check_ip/{ip}")
async def check_ip(ip: str):
    conn = get_db_connection()
    row = conn.execute('SELECT 1 FROM blocked_ips WHERE ip_address = ?', (ip,)).fetchone()
    conn.close()
    return {"ip": ip, "is_blocked": bool(row)}

@app.post("/clear_all")
async def clear_all():
    """The 'Panic Button' - Wipes only the active block list."""
    conn = get_db_connection()
    conn.execute('DELETE FROM blocked_ips')
    conn.execute('INSERT INTO system_logs (ip_address, action) VALUES (?, ?)', ('SYSTEM', 'FLUSH_ALL'))
    conn.commit()
    conn.close()
    print("ALERT: Active block list cleared by Admin")
    return {"status": "success", "message": "All IPs cleared from active blocking"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)