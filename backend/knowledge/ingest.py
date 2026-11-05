
from pathlib import Path

from retriever import client, encoder, get_collection

ROOT = Path(__file__).resolve().parent / "data"


def split_text(text: str, size: int = 700, overlap: int = 100):
    text = text.strip()
    if not text:
        return []

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])

        if end == len(text):
            break

        start = end - overlap

    return chunks


def ingest_mode(mode: str, folder_name: str):
    folder = ROOT / folder_name
    collection = get_collection(mode)

    documents = []
    ids = []
    metadatas = []

    for file in folder.glob("*.md"):
        text = file.read_text(encoding="utf-8")
        chunks = split_text(text)

        for index, chunk in enumerate(chunks):
            documents.append(chunk)
            ids.append(f"{file.stem}-{index}")
            metadatas.append({
                "source": file.name,
                "chunk_index": index,
                "mode": mode,
            })

    if not documents:
        print(f"{mode}: 没有发现可入库的 Markdown 内容")
        return

    embeddings = encoder.encode(
        documents,
        normalize_embeddings=True,
    ).tolist()

    # 重复运行时覆盖相同 ID，避免重复插入。
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )

    print(f"{mode}: 已处理 {len(documents)} 个知识片段")


if __name__ == "__main__":
    ingest_mode("408", "408")
    ingest_mode("data_analyst", "data_analyst")
