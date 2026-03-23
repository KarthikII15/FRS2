# FRS2 — Complete Setup Scripts

## Your Environment
| Role       | IP              |
|------------|-----------------|
| VM         | 172.20.100.222  |
| Jetson     | 172.18.3.202    |
| Camera     | 172.18.3.201    |

---

## Execution Order (NEVER skip or reorder)

### On the VM — run scripts in this exact order:

```
vm/01_install_docker.sh          # Install Docker + Node.js
vm/02_write_env_files.sh         # Write backend .env and frontend .env
vm/03_write_realm_json.sh        # Create keycloak/realm-export.json
vm/04_write_docker_compose.sh    # Write final merged docker-compose.yml
vm/05_start_infra.sh             # Start Postgres + Kafka + Keycloak
vm/06_wait_and_verify_infra.sh   # Health-check all three services
vm/07_migrate_seed_topics.sh     # Run DB migrations, seed data, create Kafka topics
vm/08_start_backend_frontend.sh  # Start backend + frontend containers
vm/09_verify_backend.sh          # Smoke-test backend and login
vm/10_setup_keycloak_mappers.sh  # Add audience + role mappers via Keycloak REST API
vm/11_switch_to_keycloak_mode.sh # Flip AUTH_MODE=keycloak and restart
vm/12_verify_keycloak_flow.sh    # Full end-to-end keycloak token → bootstrap test
vm/13_register_camera_device.sh  # Register the Prama camera in the DB
```

### On the Jetson — SSH in first: `ssh ubuntu@172.18.3.202`

```
jetson/J01_install_deps.sh       # Install Python packages + GStreamer
jetson/J02_write_configs.sh      # Write cameras.json and model_config.json
jetson/J03_test_camera.sh        # Verify RTSP + snapshot + backend reachability
jetson/J04_get_token.sh          # Get auth token from backend, write to file
jetson/J05_setup_token_cron.sh   # Cron job to refresh token every 25 min
jetson/J06_start_runner.sh       # Start runner.py (interactive, with live logs)
jetson/J07_install_systemd.sh    # (Optional) Install as systemd service
```

### Enroll a face (back on the VM):
```
vm/14_enroll_face.sh             # Enroll an employee face via API
```

### Final verification:
```
vm/15_final_verify.sh            # All 10 end-to-end checks
```

---

## One-time setup prerequisite
Before running any script, make sure you have cloned the repo:
```bash
git clone <your-repo-url> /opt/frs2
cd /opt/frs2/FRS--Java-Verison
```
All scripts assume the project lives at `/opt/frs2/FRS--Java-Verison`.
