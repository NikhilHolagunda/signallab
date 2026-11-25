"""Seed a demo graph without Instagram, Whisper or an LLM.

    python -m signallab.seed            # add demo reels + reading list
    python -m signallab.seed --github octocat   # ...and someone's GitHub stars

Uses canned extractions so you can see the graph/side-panel immediately.
Safe to re-run: existing demo nodes are skipped.
"""

from __future__ import annotations

import argparse
import asyncio

from .config import get_settings
from .db import Store
from .main import default_pipeline
from .models import Extraction, NodeKind, NodeStatus, ReadingItem
from .services.github import fetch_stars

DEMO_REELS: list[dict] = [
    {
        "code": "demo-rag",
        "title": "RAG in 60 seconds: chunk, embed, retrieve",
        "summary": "Explains retrieval-augmented generation: split documents into chunks, embed "
        "them, store vectors, then retrieve the top-k chunks to stuff into the prompt. Warns "
        "that chunk size and overlap matter more than the choice of vector DB.",
        "concepts": [
            {"name": "chunking", "explanation": "split docs into ~500 token windows with overlap"},
            {"name": "embeddings", "explanation": "dense vectors capturing meaning"},
            {"name": "top-k retrieval", "explanation": "nearest neighbours by cosine similarity"},
        ],
        "code_snippets": [{
            "language": "python",
            "description": "Minimal retrieval with sentence-transformers",
            "code": "from sentence_transformers import SentenceTransformer, util\n\n"
            "model = SentenceTransformer('all-MiniLM-L6-v2')\n"
            "docs = ['FastAPI is async', 'SQLite is zero-config', 'Three.js renders WebGL']\n"
            "doc_emb = model.encode(docs, normalize_embeddings=True)\n"
            "q = model.encode('which db needs no setup?', normalize_embeddings=True)\n"
            "print(docs[int(util.cos_sim(q, doc_emb).argmax())])",
        }],
        "steps": ["Chunk your docs", "Embed each chunk", "Store vectors", "Retrieve top-k per query"],
        "links": [{"url": "https://www.sbert.net", "label": "sentence-transformers docs"}],
        "topics": ["llms", "rag", "embeddings"],
    },
    {
        "code": "demo-ollama",
        "title": "Run Llama locally with Ollama",
        "summary": "Shows installing Ollama, pulling llama3.1:8b and calling it from Python with "
        "JSON mode for structured output. Local models are free, private, and good enough for "
        "extraction tasks.",
        "concepts": [
            {"name": "local inference", "explanation": "LLM runs on your own CPU/GPU"},
            {"name": "JSON mode", "explanation": "constrain output to valid JSON"},
        ],
        "code_snippets": [{
            "language": "bash", "description": "Pull and chat",
            "code": "ollama pull llama3.1:8b\nollama run llama3.1:8b 'explain RAG in one line'",
        }],
        "steps": ["Install Ollama", "ollama pull llama3.1:8b", "Call it with format='json'"],
        "links": [{"url": "https://ollama.com", "label": "Ollama"}],
        "topics": ["llms", "local ai"],
    },
    {
        "code": "demo-r3f",
        "title": "3D in React with react-three-fiber",
        "summary": "Builds a spinning mesh in React using react-three-fiber and drei's "
        "OrbitControls. Explains that r3f is a React renderer for Three.js, so scenes are "
        "components and useFrame runs every animation frame.",
        "concepts": [
            {"name": "react-three-fiber", "explanation": "React renderer for Three.js"},
            {"name": "useFrame", "explanation": "hook called on every rendered frame"},
        ],
        "code_snippets": [{
            "language": "tsx", "description": "Spinning box",
            "code": "function Box() {\n  const ref = useRef<THREE.Mesh>(null!)\n"
            "  useFrame((_, dt) => (ref.current.rotation.y += dt))\n"
            "  return <mesh ref={ref}><boxGeometry /><meshNormalMaterial /></mesh>\n}",
        }],
        "steps": [],
        "links": [{"url": "https://r3f.docs.pmnd.rs", "label": "r3f docs"}],
        "topics": ["react", "threejs", "frontend"],
    },
    {
        "code": "demo-tailwind",
        "title": "Glassmorphism cards with Tailwind v4",
        "summary": "Uses backdrop-blur, a translucent background and a 1px gradient border to "
        "build glass cards in Tailwind v4, plus @theme tokens for neon accents.",
        "concepts": [{"name": "backdrop-filter", "explanation": "blurs what's behind an element"}],
        "code_snippets": [{
            "language": "html", "description": "Glass card",
            "code": '<div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl '
            'p-6">Hello</div>',
        }],
        "steps": [],
        "links": [],
        "topics": ["css", "frontend", "design"],
    },
    {
        "code": "demo-docker",
        "title": "Docker multi-stage builds cut image size 10x",
        "summary": "Compiles in a fat builder stage, then copies only the artifact into a slim "
        "runtime image. Also covers layer caching by copying lockfiles before source.",
        "concepts": [
            {"name": "multi-stage build", "explanation": "separate build and runtime images"},
            {"name": "layer caching", "explanation": "order COPY steps by change frequency"},
        ],
        "code_snippets": [{
            "language": "dockerfile", "description": "Two-stage Node build",
            "code": "FROM node:22 AS build\nWORKDIR /app\nCOPY package*.json .\nRUN npm ci\n"
            "COPY . .\nRUN npm run build\n\nFROM node:22-slim\nCOPY --from=build /app/dist /app\n"
            "CMD [\"node\", \"/app/index.js\"]",
        }],
        "steps": [],
        "links": [],
        "topics": ["docker", "devops"],
    },
    {
        "code": "demo-sqlinj",
        "title": "SQL injection explained with one login form",
        "summary": "Demonstrates why string-concatenated SQL is dangerous and how parameterised "
        "queries fix it. Shows the classic ' OR 1=1 -- payload against a toy login form.",
        "concepts": [
            {"name": "parameterised queries", "explanation": "send data separately from SQL"},
            {"name": "least privilege", "explanation": "app DB user can't drop tables"},
        ],
        "code_snippets": [{
            "language": "python", "description": "Safe query with sqlite3",
            "code": "cur.execute('SELECT * FROM users WHERE email = ?', (email,))",
        }],
        "steps": [],
        "links": [{"url": "https://owasp.org/Top10", "label": "OWASP Top 10"}],
        "topics": ["security", "databases"],
    },
]

DEMO_READING = [
    ReadingItem(url="https://www.anthropic.com/research/building-effective-agents",
                title="Building effective agents",
                note="Patterns for LLM agents: prompt chaining, routing, orchestrator-workers.",
                tags=["llms", "agents"]),
    ReadingItem(url="https://jalammar.github.io/illustrated-transformer/",
                title="The Illustrated Transformer",
                note="Visual walkthrough of attention and the transformer architecture.",
                tags=["llms"]),
    ReadingItem(url="https://alexgarcia.xyz/sqlite-vec/",
                title="sqlite-vec",
                note="Vector search as a SQLite extension. KNN queries with vec0 virtual tables.",
                tags=["databases", "embeddings"]),
    ReadingItem(url="https://github.com/vasturiano/3d-force-graph",
                title="3d-force-graph",
                note="Force-directed graphs in WebGL using three.js and d3-force-3d.",
                tags=["threejs", "dataviz"]),
    ReadingItem(url="https://fastapi.tiangolo.com/async/",
                title="FastAPI: concurrency and async/await",
                note="When to use async def vs def in path operations.",
                tags=["python", "backend"]),
    ReadingItem(url="https://owasp.org/www-project-top-ten/",
                title="OWASP Top Ten",
                note="Most critical web application security risks.",
                tags=["security"]),
    ReadingItem(url="https://kubernetes.io/docs/concepts/overview/",
                title="Kubernetes overview",
                note="Pods, deployments, services — container orchestration basics.",
                tags=["devops"]),
]


async def seed(github: str | None) -> None:
    settings = get_settings()
    settings.ensure_dirs()
    store = Store(settings.db_path)
    pipe = default_pipeline(settings, store)

    added = 0
    for r in DEMO_REELS:
        key = f"reel:{r['code']}"
        if store.get_by_source_key(key):
            continue
        node = store.create_node(
            kind=NodeKind.REEL, source_key=key, title=r["title"],
            url=f"https://www.instagram.com/reel/{r['code']}/", status=NodeStatus.EMBEDDING,
        )
        ext = Extraction.model_validate({k: v for k, v in r.items() if k != "code"})
        await pipe.finalize_reel(
            node.id, ext, provider="demo-seed",
            extra={"transcript": "(demo node — seeded without a real reel)"},
        )
        added += 1
    print(f"reels: +{added}")

    res = await pipe.import_reading(DEMO_READING)
    print(f"reading: +{res.imported} (updated {res.updated})")

    if github:
        repos = await fetch_stars(github, settings.github_token, settings.github_max_pages)
        res = await pipe.import_github(repos)
        print(f"github stars: +{res.imported} (updated {res.updated})")

    print(f"embedder: {pipe.embedder.name} · db: {settings.db_path}")
    store.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--github", help="also import this user's GitHub stars")
    asyncio.run(seed(ap.parse_args().github))


if __name__ == "__main__":
    main()
