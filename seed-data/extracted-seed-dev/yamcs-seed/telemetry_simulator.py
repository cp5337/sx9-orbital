#!/usr/bin/env python3
"""
YAMCS Telemetry Simulator for CTAS Optical Ground Station
Generates realistic telemetry data and sends it to YAMCS via TCP
"""

import socket
import struct
import time
import math
import random
import argparse
from datetime import datetime

class GroundStationSimulator:
    def __init__(self, host='127.0.0.1', port=10015):
        self.host = host
        self.port = port
        self.sock = None
        
        # Simulation state
        self.time_offset = 0
        self.azimuth = 180.0
        self.elevation = 45.0
        self.tracking_mode = 0  # IDLE
        self.link_locked = False
        self.packet_count = 0
        
    def connect(self):
        """Connect to YAMCS TCP telemetry port"""
        print(f"Connecting to YAMCS at {self.host}:{self.port}...")
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((self.host, self.port))
        print("✅ Connected!")
        
    def generate_telemetry(self):
        """Generate realistic telemetry values"""
        t = time.time() + self.time_offset
        
        # Simulate antenna motion (slow sinusoidal movement)
        if self.tracking_mode == 2:  # TRACKING
            self.azimuth = 180.0 + 30.0 * math.sin(t / 10.0)
            self.elevation = 45.0 + 10.0 * math.cos(t / 15.0)
            azimuth_rate = 3.0 * math.cos(t / 10.0)
            elevation_rate = -0.67 * math.sin(t / 15.0)
        elif self.tracking_mode == 1:  # SLEWING
            self.azimuth += 2.0
            self.elevation += 0.5
            azimuth_rate = 2.0
            elevation_rate = 0.5
            if self.azimuth > 360.0:
                self.azimuth -= 360.0
                self.tracking_mode = 2  # Switch to tracking
        else:  # IDLE or STOWED
            azimuth_rate = 0.0
            elevation_rate = 0.0
        
        # Optical link parameters
        if self.tracking_mode == 2:
            self.link_locked = True
            signal_strength = -45.0 + random.gauss(0, 2.0)  # dBm
            ber = random.randint(1000, 5000)  # Bit error rate
            data_rate = 100  # Mbps
        else:
            self.link_locked = False
            signal_strength = -80.0 + random.gauss(0, 5.0)
            ber = random.randint(100000, 500000)
            data_rate = 0
        
        if self.link_locked:
            self.packet_count += random.randint(50, 150)
        
        # Fine tracking (only active when link locked)
        if self.link_locked:
            centroid_x = 512.0 + random.gauss(0, 2.0)
            centroid_y = 512.0 + random.gauss(0, 2.0)
            fwhm = 2.5 + random.gauss(0, 0.3)  # arcseconds
            guide_error = abs(random.gauss(0, 0.5))  # arcseconds
        else:
            centroid_x = 0.0
            centroid_y = 0.0
            fwhm = 0.0
            guide_error = 0.0
        
        # System health
        temperature = 25.0 + random.gauss(0, 1.0)  # Celsius
        uptime = int(t - self.time_offset)  # seconds
        system_status = 0 if temperature < 40.0 else 1  # NOMINAL or DEGRADED
        
        return {
            'antenna.azimuth': self.azimuth,
            'antenna.elevation': self.elevation,
            'antenna.azimuth_rate': azimuth_rate,
            'antenna.elevation_rate': elevation_rate,
            'antenna.tracking_mode': self.tracking_mode,
            'link.ber': ber,
            'link.signal_strength': signal_strength,
            'link.lock_status': 1 if self.link_locked else 0,
            'link.data_rate': data_rate,
            'link.packet_count': self.packet_count,
            'tracking.centroid_x': centroid_x,
            'tracking.centroid_y': centroid_y,
            'tracking.fwhm': fwhm,
            'tracking.guide_error': guide_error,
            'system.temperature': temperature,
            'system.uptime': uptime,
            'system.status': system_status,
        }
    
    def encode_packet(self, telemetry):
        """Encode telemetry into binary packet matching XTCE definition"""
        # Pack all parameters according to XTCE SequenceContainer order
        packet = struct.pack(
            '>ffffBIf?HIffffffIB',  # Big-endian format
            telemetry['antenna.azimuth'],           # float32
            telemetry['antenna.elevation'],         # float32
            telemetry['antenna.azimuth_rate'],      # float32
            telemetry['antenna.elevation_rate'],    # float32
            telemetry['antenna.tracking_mode'],     # uint8
            telemetry['link.ber'],                  # uint32
            telemetry['link.signal_strength'],      # float32
            telemetry['link.lock_status'],          # bool (uint8)
            telemetry['link.data_rate'],            # uint16
            telemetry['link.packet_count'],         # uint32
            telemetry['tracking.centroid_x'],       # float32
            telemetry['tracking.centroid_y'],       # float32
            telemetry['tracking.fwhm'],             # float32
            telemetry['tracking.guide_error'],      # float32
            telemetry['system.temperature'],        # float32
            telemetry['system.uptime'],             # uint32
            telemetry['system.status'],             # uint8
        )
        return packet
    
    def send_telemetry(self, telemetry):
        """Send telemetry packet to YAMCS"""
        packet = self.encode_packet(telemetry)
        self.sock.sendall(packet)
    
    def run(self, rate=1.0, duration=None):
        """Run telemetry simulation"""
        print(f"📡 Starting telemetry simulation at {rate} Hz")
        print("Press Ctrl+C to stop\n")
        
        start_time = time.time()
        packet_num = 0
        
        try:
            while True:
                telemetry = self.generate_telemetry()
                self.send_telemetry(telemetry)
                packet_num += 1
                
                # Print status every 10 packets
                if packet_num % 10 == 0:
                    mode_str = ['IDLE', 'SLEWING', 'TRACKING', 'STOWED'][telemetry['antenna.tracking_mode']]
                    lock_str = '🔒 LOCKED' if telemetry['link.lock_status'] else '🔓 UNLOCKED'
                    print(f"[{packet_num:4d}] Az:{telemetry['antenna.azimuth']:6.1f}° "
                          f"El:{telemetry['antenna.elevation']:5.1f}° "
                          f"Mode:{mode_str:8s} Link:{lock_str} "
                          f"Temp:{telemetry['system.temperature']:4.1f}°C")
                
                # Check duration
                if duration and (time.time() - start_time) >= duration:
                    print(f"\n✅ Simulation complete ({duration}s)")
                    break
                
                time.sleep(1.0 / rate)
                
        except KeyboardInterrupt:
            print("\n\n⏹️  Simulation stopped by user")
        finally:
            self.sock.close()
            print(f"Sent {packet_num} telemetry packets")

def main():
    parser = argparse.ArgumentParser(description='YAMCS Telemetry Simulator')
    parser.add_argument('--host', default='127.0.0.1', help='YAMCS host (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=10015, help='YAMCS TCP port (default: 10015)')
    parser.add_argument('--rate', type=float, default=1.0, help='Telemetry rate in Hz (default: 1.0)')
    parser.add_argument('--duration', type=int, help='Run for N seconds (default: infinite)')
    parser.add_argument('--tracking', action='store_true', help='Start in TRACKING mode')
    
    args = parser.parse_args()
    
    sim = GroundStationSimulator(args.host, args.port)
    
    if args.tracking:
        sim.tracking_mode = 2  # TRACKING
        print("🎯 Starting in TRACKING mode")
    
    try:
        sim.connect()
        sim.run(rate=args.rate, duration=args.duration)
    except ConnectionRefusedError:
        print(f"❌ Error: Could not connect to YAMCS at {args.host}:{args.port}")
        print("   Make sure YAMCS is running and the TCP data link is configured")
        return 1
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
