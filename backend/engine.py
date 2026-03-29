import pydivert
import requests
import time
import threading

blocked_ips_list = ["8.8.8.8"]

def get_blocked_ips():
    try:
        response = requests.get("http://127.0.0.1:5000/get_list_blocked_ips", timeout=0.2)
        if response.status_code == 200:
            return response.json().get("blocked_ips", [])
    except Exception:
        return ["8.8.8.8"]
    return []

# this thread will update the blocked ip list
def background_api_checker():
    global blocked_ips_list
    while True:
        # Check the API every 1 second in the background
        new_list = get_blocked_ips()
        if new_list:
            blocked_ips_list = new_list
        time.sleep(1) # Rest for 1 second

def start_firewall_fun():
    print("Firewall is starting to work...", flush=True)
    print("Press [Ctrl + C] on your keyboard to safely close the firewall.")
    
    # daemon=True means this thread will automatically close when we hit Ctrl+C
    api_thread = threading.Thread(target=background_api_checker, daemon=True)
    api_thread.start()
    
    try:
        with pydivert.WinDivert("true") as network_tap:
            for packet in network_tap:

                sender = packet.src_addr
                receiver = packet.dst_addr

                if sender in blocked_ips_list or receiver in blocked_ips_list:
                    print(f"BLOCKED: {sender} tried to communicate with {receiver}", flush=True)
                    continue 
                
                network_tap.send(packet)

    except PermissionError:
        print("ERROR: You forgot to run the Terminal as Administrator.")
    except KeyboardInterrupt:
        print("\nKeyboard interrupt. Firewall shutting down...", flush=True)

if __name__ == "__main__":
    start_firewall_fun()