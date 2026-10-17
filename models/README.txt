# Drop your Ace 1.5 (or any other) model file here.
#
# Accepted formats: .gguf (preferred), .bin, .safetensors
# Accepted names:
#   ace-1.5.gguf       ← preferred, auto-detected by start.sh
#   ace1.5.gguf
#   ace.gguf
#   *.gguf             ← fallback (set OPENAI_MODEL in .env.docker to match)
#
# Then run from the repo root:
#   ./joe.sh --local
#
# The first run loads the model into the Ollama container — this takes a
# few minutes depending on model size. Subsequent runs are instant.
#
# This README file is just a placeholder so the directory ships in the repo.
# Safe to delete once you've dropped a model in.
