import sqlite3

def setup_database():
    connection = sqlite3.connect('firewall.db')
    cursor = connection.cursor()
    
    #  Create the 'blocked_ips' table structure
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS blocked_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create the 'system_logs' table structure
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS firewall_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            port INTEGER DEFAULT NULL,       
            protocol TEXT DEFAULT 'ANY',     
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    connection.commit()
    connection.close()

if __name__ == "__main__":
    setup_database()