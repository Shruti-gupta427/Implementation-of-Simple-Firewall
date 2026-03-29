import pydivert
import requests
import time
blocked_ips = ["8.8.8.8", "10.128.10.240"]
def get_blocked_ips():
    try:
        response=requests.get("http://127.0.0.1:5000/get_list_blocked_ips", timeout=0.2) # ---fixed wrong url get_ips -> get_list_blocked_ips---
        if response.status_code == 200:
            return response.json().get("blocked_ips", []) # ---changed blocked_ip -> blocked_ips---
    except Exception:
        # if api is down
        return ["8.8.8.8"]
    return []
def start_firewall_fun():
    print("Firewall is starting to work...",flush=True)
    # KeyboardInterrupt
    print("   Press [Ctrl + C] on your keyboard to safely close the firewall and restore normal settings.")

    blocked_ips_list = get_blocked_ips()
    last_update_time = time.time()

    # Must run VS Code as Admin
    try:
        with pydivert.WinDivert("true") as network_tap:
            for packet in network_tap:
                # ---removed unneccessary loop "for packet in network_tap:"---

                # ---Added new Code to check "Only check the API for new IPs every 5 seconds (Stops the internet crash!)"---
                current_time = time.time()
                if current_time - last_update_time > 5:
                    blocked_ips_list = get_blocked_ips()
                    last_update_time = current_time
    
                sender = packet.src_addr
                receiver = packet.dst_addr

                if sender in blocked_ips_list or receiver in blocked_ips_list:
                    print(f"BLOCKED: {sender} tried to communicate with {receiver}",flush=True)
                    continue 
                network_tap.send(packet)

    except PermissionError:
        print("You forgot to run the Terminal as Administrator.")
    except KeyboardInterrupt:
        print("\n Keyboard interrupt Firewall shutting down",flush=True)

if __name__ == "__main__":
    start_firewall_fun()