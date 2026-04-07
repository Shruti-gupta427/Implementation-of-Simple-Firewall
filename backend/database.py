import sqlite3

def setup_database():
    connection = sqlite3.connect('firewall.db')
    cursor = connection.cursor()
    
    # 1. System Logs Table (Audit Trail)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2. Firewall Rules Table
    # Drop existing table to apply schema change with direction constraint
    cursor.execute('DROP TABLE IF EXISTS firewall_rules')

    cursor.execute('''
        CREATE TABLE firewall_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            port INTEGER DEFAULT NULL,       
            protocol TEXT DEFAULT 'ANY',     
            direction TEXT DEFAULT 'ANY',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ip_address, port, protocol, direction) -- ✨ Prevents duplicate rules!
        )
    ''')
    
    # 3. Clean up the mess: Delete the old, deprecated table if it exists
    cursor.execute('DROP TABLE IF EXISTS blocked_ips')
    
    connection.commit()
    connection.close()
    
    print("✅ Database reworked successfully. firewall_rules table is ready and locked down!")

if __name__ == "__main__":
    setup_database()