
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[1]
CHROMA_DIR = ROOT / "chroma_db"

client = chromadb.PersistentClient(
    path=str(CHROMA_DIR)
)

encoder = SentenceTransformer(
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)


def get_collection(mode: str):
    if mode not in {"408", "data_analyst"}:
        raise ValueError("不支持的知识库类型")

    return client.get_or_create_collection(
        name=f"zhizhi_{mode}",
        metadata={"hnsw:space": "cosine"},
    )


def retrieve(
    mode: str,
    query: str,
    top_k: int = 4,
) -> list[dict]:
    collection = get_collection(mode)

    if collection.count() == 0:
        return []

    query_embedding = encoder.encode(
        [query],
        normalize_embeddings=True,
    ).tolist()

    result = collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    return [
        {
            "text": document,
            "metadata": metadata or {},
            "distance": distance,
        }
        for document, metadata, distance in zip(
            documents, metadatas, distances
        )
    ]
