import requests

# The URL for your POST endpoint
API_URL = "http://127.0.0.1:5000/block_ip"

def add_ip_to_firewall():
    print("--- Interactive Firewall Manager ---")
    print("Type 'exit' to quit.\n")
    
    while True:
        # 1. Ask the user for an IP
        ip_to_block = input("Enter an IP address to block: ").strip()
        
        # 2. Check if they want to quit
        if ip_to_block.lower() == 'exit':
            print("Exiting manager...")
            break
            
        if not ip_to_block:
            print("Please enter a valid IP.")
            continue
            
        # 3. Send the IP to the API
        try:
            # We send it as JSON because your FastAPI expects: data.get("ip")
            response = requests.post(API_URL, json={"ip": ip_to_block})
            
            # 4. Read the server's response
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    print(f"✅ SUCCESS: {data.get('blocked')} has been added to the blocklist!")
                else:
                    print(f"⚠️ NOTICE: {data.get('message')}")
            else:
                print(f"❌ ERROR: API returned status code {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print("❌ ERROR: Could not connect to the API. Is app.py running?")

if __name__ == "__main__":
    add_ip_to_firewall()