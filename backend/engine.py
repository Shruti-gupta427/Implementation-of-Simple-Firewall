import pydivert
import requests
import time
import threading
import sys
import ipaddress

blocked_rules_list = []
recent_blocks = {} # Cache to prevent duplicate print spam

def get_blocked_ips():
    try:
        response = requests.get("http://127.0.0.1:5000/get_list_blocked_ips", timeout=0.5)
        if response.status_code == 200:
            return response.json().get("blocked_ips", [])
    except Exception:
        return None
    return []

import queue

log_queue = queue.Queue()

def background_log_sender():
    while True:
        try:
            payload = log_queue.get()
            requests.post("http://127.0.0.1:5000/log_packet", json=payload, timeout=0.5)
        except Exception:
            pass

def background_api_checker():
    global blocked_rules_list
    while True:
        new_rules = get_blocked_ips()
        if new_rules is not None:
            blocked_rules_list = new_rules 
        time.sleep(1)

# Start logging thread
threading.Thread(target=background_log_sender, daemon=True).start()

# --- NEW: A reusable worker function that can listen on any network layer ---
def packet_bouncer(layer_name, layer_enum):
    # Kernel-level filter! By ignoring port 5000/5173 inside the OS driver, 
    # AND completely ignoring local loopback traffic (127.0.0.1), we 
    # guarantee the React UI, VPN proxies, and FastAPI never disconnect!
    safe_port_filter = "(!tcp or (tcp.SrcPort != 5000 and tcp.DstPort != 5000 and tcp.SrcPort != 5173 and tcp.DstPort != 5173)) and (ip.SrcAddr != 127.0.0.1 and ip.DstAddr != 127.0.0.1)"
    
    try:
        with pydivert.WinDivert(safe_port_filter, layer=layer_enum) as network_tap:
            for packet in network_tap:
                
                if not packet.ipv4 and not packet.ipv6:
                    try:
                        network_tap.send(packet)
                    except OSError:
                        pass
                    continue

                sender = packet.src_addr
                receiver = packet.dst_addr
                
                is_tcp = packet.tcp is not None
                is_udp = packet.udp is not None
                is_icmp = packet.icmp is not None

                # (Python-level whitelists removed because they are now safely enforced securely in the kernel driver!)

                should_drop = False
                match_reason = ""

                # Layer 4 (Transport layer inspection)
                for rule in blocked_rules_list:
                    rule_ip = rule.get("ip_address")
                    rule_port = rule.get("port")    
                    rule_proto = rule.get("protocol", "ANY").upper()
                    rule_direction = rule.get("direction", "ANY").upper()

                    # --- ✨ NEW: Subnet and Exact IP Matching ---
                    ip_matches = False
                    try:
                        target_network = ipaddress.ip_network(rule_ip, strict=False)
                        sender_ip = ipaddress.ip_address(sender)
                        receiver_ip = ipaddress.ip_address(receiver)
                        
                        if rule_direction == "INBOUND":
                            if sender_ip in target_network:
                                ip_matches = True
                        elif rule_direction == "OUTBOUND":
                            if receiver_ip in target_network:
                                ip_matches = True
                        else:
                            if sender_ip in target_network or receiver_ip in target_network:
                                ip_matches = True
                    except ValueError:
                        pass # Ignore malformed database entries

                    if ip_matches:
                        
                        # match protocol & port
                        if rule_proto == "ANY":
                            should_drop = True
                            match_reason = "IP_BLOCK_ALL"
                        
                        elif rule_proto == "TCP" and is_tcp:
                            # if rule_port is None, block ALL TCP. otherwise, match specific port.
                            if rule_port is None or packet.tcp.src_port == rule_port or packet.tcp.dst_port == rule_port:
                                should_drop = True
                                match_reason = f"TCP_PORT_{rule_port if rule_port else 'ALL'}"
                        
                        elif rule_proto == "UDP" and is_udp:
                            if rule_port is None or packet.udp.src_port == rule_port or packet.udp.dst_port == rule_port:
                                should_drop = True
                                match_reason = f"UDP_PORT_{rule_port if rule_port else 'ALL'}"
                        
                        elif rule_proto == "ICMP" and is_icmp:
                            should_drop = True
                            match_reason = "ICMP_BLOCK"

                    if should_drop:
                        break # No need to check other rules for this packet

                if should_drop:
                    current_time = time.time()
                    log_key = f"[{layer_name}]-{sender}-{receiver}-{match_reason}" 
                    
                    if log_key not in recent_blocks or (current_time - recent_blocks.get(log_key, 0)) > 2:
                        print(f"[{layer_name}] Blocked: {sender} -> {receiver} | because {match_reason}", flush=True)
                        recent_blocks[log_key] = current_time 
                        
                        # --- ✨ NEW: Route to Laptop or Phone ---
                        device_target = "LAPTOP" if layer_name == "LOCAL" else "PHONE"
                        
                        try:
                            import socket
                            host_ips = socket.gethostbyname_ex(socket.gethostname())[2]
                        except Exception:
                            host_ips = []
                            
                        # --- ✨ NEW: Shoot the data to FastAPI ---
                        payload = {
                            "status": "BLOCKED",
                            "protocol": rule_proto if rule_proto != "ANY" else "PKT",
                            "source_ip": sender,
                            "destination_ip": receiver,
                            "device": device_target, # We send "device" instead of "server"
                            "service": match_reason,
                            "host_ips": host_ips
                        }

                        try:
                            # Push to queue to prevent blocking!
                            log_queue.put(payload)
                        except Exception:
                            pass 

                    continue 
                
                # Extract proto for logging before sending!
                proto_name = "PKT"
                if is_tcp: proto_name = "TCP"
                elif is_udp: proto_name = "UDP"
                elif is_icmp: proto_name = "ICMP"

                try:
                    network_tap.send(packet)
                except OSError:
                    pass
                    
                # --- ✨ NEW: Rate-limited Allowed Packet Logging ---
                current_time = time.time()
                allowed_log_key = f"[{layer_name}]-ALLOWED-{sender}-{receiver}"
                
                if allowed_log_key not in recent_blocks or (current_time - recent_blocks.get(allowed_log_key, 0)) > 1.5:
                    recent_blocks[allowed_log_key] = current_time 
                    
                    device_target = "LAPTOP" if layer_name == "LOCAL" else "PHONE"
                    
                    try:
                        import socket
                        host_ips = socket.gethostbyname_ex(socket.gethostname())[2]
                        if sender in host_ips or receiver in host_ips:
                            if layer_name == "HOTSPOT":
                                # If it's on hotspot but includes our exact host IP, it's the laptop talking to the phone
                                # We'll handle this purely in frontend if we pass the host_ips
                                pass
                    except Exception:
                        host_ips = []
                    
                    payload = {
                        "status": "ALLOWED",
                        "protocol": proto_name,
                        "source_ip": sender,
                        "destination_ip": receiver,
                        "device": device_target,
                        "service": "ALLOWED",
                        "host_ips": host_ips
                    }
                    try:
                        log_queue.put(payload)
                    except Exception:
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