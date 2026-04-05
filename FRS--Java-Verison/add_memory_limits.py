import yaml
import sys

with open('docker-compose.yml', 'r') as f:
    compose = yaml.safe_load(f)

# Add memory limits to kafka
if 'kafka' in compose['services']:
    compose['services']['kafka']['deploy'] = {
        'resources': {
            'limits': {'memory': '1G'},
            'reservations': {'memory': '512M'}
        }
    }

# Add memory limits to keycloak
if 'keycloak' in compose['services']:
    compose['services']['keycloak']['deploy'] = {
        'resources': {
            'limits': {'memory': '1G'},
            'reservations': {'memory': '512M'}
        }
    }

# Add memory limits to backend
if 'backend' in compose['services']:
    compose['services']['backend']['deploy'] = {
        'resources': {
            'limits': {'memory': '512M'},
            'reservations': {'memory': '256M'}
        }
    }

with open('docker-compose.yml', 'w') as f:
    yaml.dump(compose, f, default_flow_style=False, sort_keys=False)

print("✓ Memory limits added to docker-compose.yml")
