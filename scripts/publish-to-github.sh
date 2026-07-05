#!/usr/bin/env bash
set -euo pipefail

# Run from Demo/trysynpath after cloning Demo repository.
# Pushes this folder to https://github.com/YukiC0804/trysynpath

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f package.json ]; then
  echo "Run this script from the trysynpath directory."
  exit 1
fi

rm -rf .git
git init
git checkout -B main
git add -A
git commit -m "Initial commit: Synpath operations command centre demo"
git remote add origin https://github.com/YukiC0804/trysynpath.git
git push -u origin main

echo "Done: https://github.com/YukiC0804/trysynpath"
