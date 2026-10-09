$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskModel = Join-Path $taskRoot '.local-ai/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
$taskRuntime = Get-ChildItem -LiteralPath (Join-Path $taskRoot '.local-ai/runtime') -Filter 'llama-server.exe' -Recurse | Select-Object -First 1
if (-not $taskRuntime -or -not (Test-Path -LiteralPath $taskModel)) { throw 'Install the CPU runtime and Qwen3-4B-Instruct-2507-Q4_K_M model using docs/LOCAL_AI.md first.' }
# Loopback only. CPU backend, one request at a time. No cloud fallback.
& $taskRuntime.FullName -m $taskModel --alias atrion-local --host 127.0.0.1 --port 8081 -ngl 0 -c 12288 -np 1 -t 6 --jinja --reasoning off
exit $LASTEXITCODE
