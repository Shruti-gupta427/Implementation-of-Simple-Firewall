import requests

API_URL = "http://127.0.0.1:5000"

def print_header(title):
    print(f"\n{'='*40}")
    print(f" {title}")
    print(f"{'='*40}")

def add_rule():
    print_header("ADD NEW RULE")
    ip_to_block = input("Enter IP or Subnet (e.g., 1.1.1.1 or 10.0.0.0/24): ").strip()
    if not ip_to_block: return
    
    port_input = input("Enter Port (e.g., 80, 443) or press Enter for ALL: ").strip()
    port = int(port_input) if port_input.isdigit() else None
    
    proto_input = input("Enter Protocol (TCP/UDP/ICMP) or press Enter for ANY: ").strip().upper()
    protocol = proto_input if proto_input in ['TCP', 'UDP', 'ICMP'] else "ANY"
    
    try:
        payload = {"ip": ip_to_block, "port": port, "protocol": protocol}
        response = requests.post(f"{API_URL}/block_ip", json=payload)
        data = response.json()
        if data.get("status") == "success":
            print(f"✅ SUCCESS: Rule added -> {data.get('rule')}")
        else:
            print(f"⚠️ NOTICE: {data.get('message')}")
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Could not connect to the API.")

def view_rules():
    print_header("ACTIVE FIREWALL RULES")
    try:
        response = requests.get(f"{API_URL}/get_list_blocked_ips")
        rules = response.json().get("blocked_ips", [])
        
        if not rules:
            print("🟢 No active rules. Traffic is flowing freely.")
            return
            
        print(f"{'IP / SUBNET':<20} | {'PORT':<6} | {'PROTOCOL':<8}")
        print("-" * 40)
        for r in rules:
            port_str = str(r['port']) if r['port'] is not None else 'ALL'
            print(f"{r['ip_address']:<20} | {port_str:<6} | {r['protocol']:<8}")
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Could not connect to the API.")

def delete_rule():
    print_header("DELETE RULE")
    ip = input("Enter the IP or Subnet to UNBLOCK: ").strip()
    if not ip: return
    
    try:
        response = requests.delete(f"{API_URL}/unblock_ip/{ip}")
        if response.status_code == 200:
            print(f"✅ SUCCESS: Removed all rules for {ip}")
        elif response.status_code == 404:
            print(f"⚠️ NOTICE: No rules found for {ip}")
        else:
            print(f"❌ ERROR: API returned status code {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Could not connect to the API.")

def firewall_manager():
    while True:
        print_header("🛡️ MAIN MENU")
        print("1. ➕ Add a Rule")
        print("2. 📋 View All Rules")
        print("3. 🗑️ Delete Rule (By IP/Subnet)")
        print("4. 🚪 Exit")
        
        choice = input("\nSelect an option (1-4): ").strip()
        
        if choice == '1':
            add_rule()
        elif choice == '2':
            view_rules()
        elif choice == '3':
            delete_rule()
        elif choice == '4':
            print("\nExiting Manager. (Firewall engine is still running in the background)")
            break
        else:
            print("⚠️ Invalid choice. Please select 1-4.")

if __name__ == "__main__":
    try:
        firewall_manager()
    except KeyboardInterrupt:
        print("\nExiting Manager...")