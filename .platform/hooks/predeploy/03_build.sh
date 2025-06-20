# .platform/hooks/predeploy/03_build.sh
#!/usr/bin/env bash
set -e

# Move into the unpacked app directory
cd "$EB_DEPLOY_DIR"

# Run Next.js build
yarn build
