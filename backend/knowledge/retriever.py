
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
CHROMA_DIR = ROOT / "chroma_db"

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

client = None
encoder = None

_client_lock = Lock()
_encoder_lock = Lock()


def get_client():
    """首次使用知识库时才导入并初始化 ChromaDB。"""
    global client

    if client is None:
        with _client_lock:
            if client is None:
                import chromadb

                client = chromadb.PersistentClient(
                    path=str(CHROMA_DIR)
                )

    return client


def get_encoder():
    """首次进行向量检索时才导入并加载模型。"""
    global encoder

    if encoder is None:
        with _encoder_lock:
            if encoder is None:
                from sentence_transformers import SentenceTransformer

                encoder = SentenceTransformer(MODEL_NAME)

    return encoder


def get_collection(mode: str):
    """获取 408 知识库集合。"""
    if mode != "408":
        raise ValueError("目前仅支持 408 知识库")

    return get_client().get_or_create_collection(
        name="zhizhi_408",
        metadata={"hnsw:space": "cosine"},
    )


def retrieve(
    mode: str,
    query: str,
    top_k: int = 4,
) -> list[dict]:
    """执行 408 知识库向量检索。"""
    if not query or not query.strip():
        return []

    collection = get_collection(mode)
    count = collection.count()

    if count == 0:
        return []

    model = get_encoder()

    query_embedding = model.encode(
        [query.strip()],
        normalize_embeddings=True,
    ).tolist()

    result = collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, count),
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
            documents,
            metadatas,
            distances,
        )
    ]
