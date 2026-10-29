#!/bin/sh
cmd=$(jq -r '.tool_input.command')
case "$cmd" in *"rm -rf"*) echo "止めた: $cmd" >&2; exit 2 ;; esac
