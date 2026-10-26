#!/usr/bin/env bash
set -e

# Personal AI - Provider Switcher for macOS & Linux
# Usage:
#   ./scripts/switch-provider.sh runpod
#   ./scripts/switch-provider.sh openrouter [API_KEY] [MODEL]

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PROVIDER="$1"
API_KEY="$2"
MODEL="$3"

if [ -z "$PROVIDER" ]; then
  echo "=========================================="
  echo " Personal AI - Provider Switcher (macOS)"
  echo "=========================================="
  echo "1) RunPod (vLLM Qwen 3.6 35B NVFP4)"
  echo "2) OpenRouter (Qwen Pay-per-Token)"
  read -p "Wähle Anbieter (1 oder 2): " choice
  if [ "$choice" = "1" ]; then
    PROVIDER="runpod"
  elif [ "$choice" = "2" ]; then
    PROVIDER="openrouter"
  else
    echo "Ungültige Auswahl."
    exit 1
  fi
fi

if [ "$PROVIDER" = "runpod" ]; then
  echo "Konfiguriere RunPod..."
  BASE_URL="https://f1cf2041wgp4d4-8000.proxy.runpod.net"
  TARGET_MODEL="${MODEL:-nvidia/Qwen3.6-35B-A3B-NVFP4}"

  sed -i.bak -E "s|VLLM_BASE_URL = \".*\"|VLLM_BASE_URL = \"$BASE_URL\"|" wrangler.toml
  sed -i.bak -E "s|VLLM_MODEL = \".*\"|VLLM_MODEL = \"$TARGET_MODEL\"|" wrangler.toml
  rm -f wrangler.toml.bak

  if [ -n "$API_KEY" ]; then
    echo "$API_KEY" | npx wrangler secret put VLLM_API_KEY
  fi

  echo "Deploye Worker..."
  npx wrangler deploy --keep-vars
  echo "Erfolgreich auf RunPod umgestellt!"

elif [ "$PROVIDER" = "openrouter" ]; then
  echo "Konfiguriere OpenRouter..."
  BASE_URL="https://openrouter.ai/api/v1"
  TARGET_MODEL="${MODEL:-qwen/qwen3.6-35b-a3b}"

  sed -i.bak -E "s|VLLM_BASE_URL = \".*\"|VLLM_BASE_URL = \"$BASE_URL\"|" wrangler.toml
  sed -i.bak -E "s|VLLM_MODEL = \".*\"|VLLM_MODEL = \"$TARGET_MODEL\"|" wrangler.toml
  rm -f wrangler.toml.bak

  if [ -z "$API_KEY" ]; then
    read -p "Gib deinen OpenRouter API Key ein (oder Enter zum Überspringen): " API_KEY
  fi
  if [ -n "$API_KEY" ]; then
    echo "$API_KEY" | npx wrangler secret put VLLM_API_KEY
  fi

  echo "Deploye Worker..."
  npx wrangler deploy --keep-vars
  echo "Erfolgreich auf OpenRouter umgestellt ($TARGET_MODEL)!"
fi
