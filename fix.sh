cd docs/codex-context
for f in *; do mv -- "$f" "$(echo "$f" | tr -d '[]' | sed 's|(http://[^)]*)||g')"; done
cd ../..
rm -f AGENTS.md
ln -s docs/codex-context/FINAL_AGENTS.md AGENTS.md
ls docs/codex-context
