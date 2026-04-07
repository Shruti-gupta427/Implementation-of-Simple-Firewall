# Minor Bugs

## 1. Wrong Table Name
In `app.py` `block_ip` function wrong name of table (logs instead of system_logs was mentioned)

## 2. Incomplete Cache
In `engine.py` 
```python
f"[{layer_name}]-{sender}-{receiver}-{match_reason}"
```
`layer_name` is mandatory so that we don't get two block messages in the terminal when the device connected via hotspot tried to access blocked network. 
This double messages comes because first the device tries to pass the message to laptop laptop tried to pass that message to the network but the firewall blocks it, then the laptop tries to pass the message to the device itself as the final atttempt to find an escape but the firewall again blocks it, so **2 BLOCKS** happen, but logically one is needed to be presented.

# Major Bugs

## 1. Incomplete Database Schema
in `database.py`, the `firewall_rules` table currently allows duplicate entries. If someone runs the script twice, it will insert the exact same rule twice. We need to add a **UNIQUE(ip_address, port, protocol)** constraint to the table creation script so the database rejects duplicates automatically.

Additionally, firewall rules are sometimes a strict combination of IP + Port + Protocol. However, they also need to be flexible enough to block an entire single IP, a specific port globally, or even an Entire Subnet (e.g., 10.0.0.0/8).

We have to ensure our database schema can store all these different types of combinations cleanly. For the backend logic, utilizing the built-in Python `ipaddress` library will be the best way to handle parsing and checking those subnet blocks.