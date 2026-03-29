from fastapi import FastAPI, Request, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Firewall API")
# cors configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
blocked_ip = ["8.8.8.8"]

@app.get("/get_list_blocked_ips")
async def get_ips():
    return {"blocked_ips": blocked_ip}

@app.post("/block_ip")
async def block_ip(request: Request,data: dict = Body(...)):
    data = await request.json()
    ip = data.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="No IP provided")
    if ip not in blocked_ip:
        blocked_ip.append(ip)
        print(f"Added {ip} to list")
        return {"status": "success", "blocked":ip}
    return {"status": "error", "message": "Already in blocked ip list"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)