import pydivert
blocked_ips = ["8.8.8.8", "10.128.10.240"]

def start_firewall_fun():
    print("Firewall is starting to work...",flush=True)
    print(f"Currently blocking these guests: {blocked_ips}",flush=True)
    # KeyboardInterrupt
    print("   Press [Ctrl + C] on your keyboard to safely close the firewall and restore normal settings.")
    # Must run VS Code as Admin
    try:
        with pydivert.WinDivert("ip") as network_tap:
            for packet in network_tap:
    
                sender = packet.src_addr
                receiver = packet.dst_addr

                if sender in blocked_ips or receiver in blocked_ips:
                    print(f"BLOCKED: {sender} tried to communicate with {receiver}",flush=True)
                    continue 
                network_tap.send(packet)

    except PermissionError:
        print("You forgot to run the Terminal as Administrator.")
    except KeyboardInterrupt:
        print("\n Keyboard interrupt Firewall shutting down",flush=True)

if __name__ == "__main__":
    start_firewall_fun()