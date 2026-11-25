"""SignalLab media worker: yt-dlp download, Whisper transcription, sentence embeddings.

Called by the n8n ingest workflow over HTTP (see app.py) and by the Spring
backend for query/GitHub-star embeddings. Also usable as a CLI (cli.py) from an
n8n Execute Command node if you run n8n on a Debian image with these deps.
"""

__version__ = "0.2.0"
