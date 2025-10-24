#!/usr/bin/env python3
"""
UDP Listener for Encoder Video Player
Receives and displays encoder position updates via UDP broadcast
"""

import socket
import json
import time
from datetime import datetime

def main():
    """Listen for UDP broadcasts from encoder video player"""
    port = 3045
    
    # Create UDP socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('', port))
    
    print(f"Listening for encoder updates on UDP port {port}...")
    print("Press Ctrl+C to stop")
    print("-" * 60)
    
    try:
        while True:
            data, addr = sock.recvfrom(1024)
            try:
                message = json.loads(data.decode('utf-8'))
                timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                
                encoder_pos = message.get('encoder_position', 'N/A')
                
                print(f"{timestamp} | Encoder Position: {encoder_pos:6} | From: {addr[0]}")
                      
            except json.JSONDecodeError:
                print(f"Invalid JSON from {addr[0]}: {data}")
            except Exception as e:
                print(f"Error processing message from {addr[0]}: {e}")
                
    except KeyboardInterrupt:
        print("\nStopping UDP listener...")
    finally:
        sock.close()

if __name__ == "__main__":
    main()
    