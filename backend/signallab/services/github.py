"""Fetch a user's GitHub stars."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import httpx

log = logging.getLogger(__name__)


@dataclass
class StarredRepo:
    full_name: str
    description: str
    html_url: str
    language: str | None
    stars: int
    topics: list[str] = field(default_factory=list)
    starred_at: str | None = None

    @property
    def embed_text(self) -> str:
        bits = [self.full_name.replace("/", " "), self.description]
        if self.language:
            bits.append(self.language)
        if self.topics:
            bits.append(" ".join(self.topics))
        return ". ".join(b for b in bits if b)


class GithubError(Exception):
    pass


async def fetch_stars(
    username: str,
    token: str = "",
    max_pages: int = 10,
    client: httpx.AsyncClient | None = None,
) -> list[StarredRepo]:
    headers = {
        # star+json adds `starred_at` so we can place stars on a timeline.
        "Accept": "application/vnd.github.star+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "signallab",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=30)
    repos: list[StarredRepo] = []
    try:
        for page in range(1, max_pages + 1):
            r = await client.get(
                f"https://api.github.com/users/{username}/starred",
                params={"per_page": 100, "page": page},
                headers=headers,
            )
            if r.status_code == 404:
                raise GithubError(f"GitHub user {username!r} not found")
            if r.status_code == 403 and r.headers.get("x-ratelimit-remaining") == "0":
                raise GithubError("GitHub rate limit hit — set GITHUB_TOKEN in .env")
            r.raise_for_status()
            items = r.json()
            if not items:
                break
            for item in items:
                repo = item.get("repo", item)  # star+json wraps the repo
                repos.append(
                    StarredRepo(
                        full_name=repo["full_name"],
                        description=(repo.get("description") or "").strip(),
                        html_url=repo["html_url"],
                        language=repo.get("language"),
                        stars=int(repo.get("stargazers_count", 0)),
                        topics=list(repo.get("topics") or []),
                        starred_at=item.get("starred_at"),
                    )
                )
            if len(items) < 100:
                break
    finally:
        if own_client:
            await client.aclose()
    return repos
