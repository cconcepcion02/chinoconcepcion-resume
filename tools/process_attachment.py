from __future__ import annotations

import json
import sys
from pathlib import Path


def transcribe_audio(file_path: Path, model_name: str) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(file_path), beam_size=1, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    return {
        "text": text,
        "language": getattr(info, "language", None),
    }


def extract_pdf(file_path: Path) -> dict:
    from pypdf import PdfReader

    reader = PdfReader(str(file_path))
    pages = []
    for page in reader.pages:
        pages.append((page.extract_text() or "").strip())
    text = "\n\n".join(page for page in pages if page).strip()
    return {"text": text}


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: process_attachment.py <audio|pdf> <file_path> [model]")

    command = sys.argv[1]
    file_path = Path(sys.argv[2]).expanduser().resolve()

    if command == "audio":
        model_name = sys.argv[3] if len(sys.argv) > 3 else "tiny"
        result = transcribe_audio(file_path, model_name)
    elif command == "pdf":
        result = extract_pdf(file_path)
    else:
        raise SystemExit(f"Unknown command: {command}")

    print(json.dumps(result))


if __name__ == "__main__":
    main()
