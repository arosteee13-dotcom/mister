#!/bin/zsh
# verify.sh <ID...>: plantillas (incluye clubes no jugables), repetidos y lint
node /var/folders/0f/mskspkv13z32b90kxsqy5p2c0000gn/T/opencode/tsquad.js "$@"
node /var/folders/0f/mskspkv13z32b90kxsqy5p2c0000gn/T/opencode/chk_fast.js
