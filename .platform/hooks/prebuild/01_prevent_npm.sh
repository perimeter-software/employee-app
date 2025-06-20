#!/usr/bin/env bash
# create an (empty) node_modules so EB skips `npm install`
set -e

# Install system build tools (if you need native modules)
dnf install -y gcc-c++ make

# Install Yarn v1 globally
npm install -g yarn@^1

# Stub out node_modules so EB skips its own npm install
mkdir -p node_modules