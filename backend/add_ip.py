import requests

API_URL = "http://127.0.0.1:5000/block_ip"

def add_ip_to_firewall():
    print("--- 🛡️ Interactive Layer 4 Firewall Manager ---")
    print("Type 'exit' to quit at any prompt.\n")
    
    while True:
        ip_to_block = input("\nEnter IP or Subnet to block (e.g., 1.1.1.1 or 10.0.0.0/24): ").strip()
        if ip_to_block.lower() == 'exit': break
        if not ip_to_block: continue
        
        port_input = input("Enter Port (e.g., 80, 443) or press Enter to block ALL ports: ").strip()
        if port_input.lower() == 'exit': break
        port = int(port_input) if port_input.isdigit() else None
        
        proto_input = input("Enter Protocol (TCP/UDP/ICMP) or press Enter for ANY: ").strip().upper()
        if proto_input.lower() == 'EXIT': break
        protocol = proto_input if proto_input in ['TCP', 'UDP', 'ICMP'] else "ANY"
        
        try:
            payload = {"ip": ip_to_block, "port": port, "protocol": protocol}
            response = requests.post(API_URL, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    print(f"✅ SUCCESS: Rule added -> {data.get('rule')}")
                else:
                    print(f"⚠️ NOTICE: {data.get('message')}")
            else:
                print(f"❌ ERROR: API returned status code {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print("❌ ERROR: Could not connect to the API. Is app.py running?")

if __name__ == "__main__":
    add_ip_to_firewall()