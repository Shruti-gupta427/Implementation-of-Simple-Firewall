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

