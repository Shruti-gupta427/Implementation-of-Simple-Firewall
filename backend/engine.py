import pydivert
import requests
import time
blocked_ips = ["8.8.8.8", "10.128.10.240"]
def get_blocked_ips():
    try:
        response=requests.get("http://127.0.0.1:5000/get_ips", timeout=0.2)
        if response.status_code == 200:
            return response.json().get("blocked_ip", [])
    except Exception:
        # if api is down
        return ["8.8.8.8"]
    return []
def start_firewall_fun():
    print("Firewall is starting to work...",flush=True)
    # KeyboardInterrupt
    print("   Press [Ctrl + C] on your keyboard to safely close the firewall and restore normal settings.")
    # Must run VS Code as Admin
    try:
        with pydivert.WinDivert("true") as network_tap:
            for packet in network_tap:
                blocked_ip = get_blocked_ips()
            for packet in network_tap:
    
                sender = packet.src_addr
                receiver = packet.dst_addr

                if sender in blocked_ip or receiver in blocked_ip:
                    print(f"BLOCKED: {sender} tried to communicate with {receiver}",flush=True)
                    continue 
                network_tap.send(packet)

    except PermissionError:
        print("You forgot to run the Terminal as Administrator.")
    except KeyboardInterrupt:
        print("\n Keyboard interrupt Firewall shutting down",flush=True)

if __name__ == "__main__":
    start_firewall_fun()