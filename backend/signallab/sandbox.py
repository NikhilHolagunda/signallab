"""Write a 1-page recap + extracted code to disk as a tiny runnable sandbox.

data/sandboxes/<node_id>/
    README.md        <- the recap
    snippet_1.py     <- each extracted code block, with a sensible extension
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from .models import Node

EXT = {
    "python": "py", "py": "py", "javascript": "js", "js": "js", "typescript": "ts",
    "ts": "ts", "tsx": "tsx", "jsx": "jsx", "bash": "sh", "shell": "sh", "sh": "sh",
    "zsh": "sh", "powershell": "ps1", "go": "go", "rust": "rs", "java": "java",
    "kotlin": "kt", "c": "c", "cpp": "cpp", "c++": "cpp", "csharp": "cs", "c#": "cs",
    "sql": "sql", "html": "html", "css": "css", "json": "json", "yaml": "yaml",
    "yml": "yaml", "dockerfile": "Dockerfile", "ruby": "rb", "php": "php", "swift": "swift",
}


def render_recap(node: Node) -> str:
    d = node.data
    ext = d.get("extraction", {})
    lines = [f"# {node.title}", ""]
    if node.url:
        lines += [f"Source: {node.url}", ""]
    if d.get("degraded"):
        lines += ["> ⚠️ Extracted without an LLM (heuristic fallback). Retry once one is up.", ""]
    if node.summary:
        lines += ["## Summary", "", node.summary, ""]
    if ext.get("concepts"):
        lines += ["## Key concepts", ""]
        lines += [
            f"- **{c['name']}**" + (f" — {c['explanation']}" if c.get("explanation") else "")
            for c in ext["concepts"]
        ]
        lines.append("")
    if ext.get("steps"):
        lines += ["## Steps", ""]
        lines += [f"{i}. {s}" for i, s in enumerate(ext["steps"], 1)]
        lines.append("")
    for i, snip in enumerate(ext.get("code_snippets", []), 1):
        if i == 1:
            lines += ["## Code", ""]
        if snip.get("description"):
            lines.append(f"**{i}.** {snip['description']}")
        lines += [f"```{snip.get('language', '')}", snip["code"].rstrip(), "```", ""]
    if ext.get("links"):
        lines += ["## Links", ""]
        lines += [f"- [{lk.get('label') or lk['url']}]({lk['url']})" for lk in ext["links"]]
        lines.append("")
    if ext.get("topics"):
        lines += ["Topics: " + ", ".join(f"`{t}`" for t in ext["topics"]), ""]
    return "\n".join(lines).rstrip() + "\n"


def _ext_for(language: str) -> str:
    lang = re.sub(r"[^a-z+#]", "", (language or "").lower())
    return EXT.get(lang, "txt")


def write_sandbox(root: Path, node: Node) -> Path:
    folder = root / node.id
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    (folder / "README.md").write_text(render_recap(node), encoding="utf-8")
    snippets = node.data.get("extraction", {}).get("code_snippets", [])
    for i, snip in enumerate(snippets, 1):
        ext = _ext_for(snip.get("language", ""))
        name = "Dockerfile" if ext == "Dockerfile" else f"snippet_{i}.{ext}"
        (folder / name).write_text(snip["code"].rstrip() + "\n", encoding="utf-8")
    return folder
