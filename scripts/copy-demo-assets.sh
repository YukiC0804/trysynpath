#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${ROOT}/download"
PUBLIC_DIR="${ROOT}/public"

DRAWING_OUT="${PUBLIC_DIR}/se-housing-4421-drawing.png"
SPEC_OUT="${PUBLIC_DIR}/se-housing-tool-build-spec.png"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Missing download folder: $SRC_DIR"
  exit 1
fi

shopt -s nullglob
files=("$SRC_DIR"/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP})
shopt -u nullglob

if ((${#files[@]} == 0)); then
  echo "No image files found in $SRC_DIR"
  exit 1
fi

pick_file() {
  local pattern="$1"
  local fallback="$2"
  local match=""

  for file in "${files[@]}"; do
    if [[ "$(basename "$file")" =~ $pattern ]]; then
      match="$file"
      break
    fi
  done

  if [[ -z "$match" ]]; then
    match="$fallback"
  fi

  printf '%s' "$match"
}

drawing_src="$(pick_file '(housing|drawing|4421|pdf)' "${files[0]}")"
spec_src="$(pick_file '(spec|tool|build|xlsx)' "${files[1]:-${files[0]}}")"

cp "$drawing_src" "$DRAWING_OUT"
cp "$spec_src" "$SPEC_OUT"

echo "Copied drawing: $(basename "$drawing_src") -> $(basename "$DRAWING_OUT")"
echo "Copied spec: $(basename "$spec_src") -> $(basename "$SPEC_OUT")"
