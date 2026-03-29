import pydivert
import requests
import time
import threading
import sys

blocked_ips_list = ["8.8.8.8"]
recent_blocks = {} # Cache to prevent duplicate print spam

def get_blocked_ips():
    try:
        response = requests.get("http://127.0.0.1:5000/get_list_blocked_ips", timeout=0.2)
        if response.status_code == 200:
            return response.json().get("blocked_ips", [])
    except Exception:
        return ["8.8.8.8"]
    return []

def background_api_checker():
    global blocked_ips_list
    while True:
        new_list = get_blocked_ips()
        if new_list:
            blocked_ips_list = new_list
        time.sleep(1)

# --- NEW: A reusable worker function that can listen on any network layer ---
def packet_bouncer(layer_name, layer_enum):
    try:
        # We pass the specific layer we want this thread to listen to
        with pydivert.WinDivert("true", layer=layer_enum) as network_tap:
            for packet in network_tap:
                
                if not packet.ipv4 and not packet.ipv6:
                    network_tap.send(packet)
                    continue

                sender = packet.src_addr
                receiver = packet.dst_addr

                if sender in blocked_ips_list or receiver in blocked_ips_list:
                    current_time = time.time()
                    log_key = f"[{layer_name}]-{sender}-{receiver}"
                    
                    # Print cache logic to prevent log spam
                    if log_key not in recent_blocks or (current_time - recent_blocks.get(log_key, 0)) > 1:
                        print(f"[{layer_name}] BLOCKED: {sender} tried to communicate with {receiver}", flush=True)
                        recent_blocks[log_key] = current_time 
                    
                    continue # Drop the packet
                
                try:
                    network_tap.send(packet)
                except OSError as e:
                    if getattr(e, 'winerror', None) == 87:
                        pass 
                    else:
                        pass
    except Exception as e:
        print(f"[{layer_name}] Error: {e}")

def start_firewall_fun():
    print("Firewall is starting to work...", flush=True)
    
    # Quick check to ensure we have Administrator rights before spawning threads
    try:
        with pydivert.WinDivert("true") as test_handle:
            pass # Just open and immediately close it to test permissions
    except PermissionError:
        print("ERROR: You forgot to run the Terminal as Administrator.")
        sys.exit(1)

    print("Press [Ctrl + C] on your keyboard to safely close the firewall.")

    # 1. Start the API background thread
    threading.Thread(target=background_api_checker, daemon=True).start()
    
    # 2. Start the Local Firewall (Protects the laptop)
    threading.Thread(target=packet_bouncer, args=("LOCAL", pydivert.Layer.NETWORK), daemon=True).start()
    
    # 3. Start the Forwarding Firewall (Protects hotspot devices!)
    threading.Thread(target=packet_bouncer, args=("HOTSPOT", pydivert.Layer.NETWORK_FORWARD), daemon=True).start()

    # Keep the main thread alive so the daemon threads can do their work
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nKeyboard interrupt. Firewall shutting down...", flush=True)

if __name__ == "__main__":
    start_firewall_fun()