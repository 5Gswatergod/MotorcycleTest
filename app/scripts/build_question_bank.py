from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
REGULAR_PDF = ROOT / "source-pdfs" / "motorcycle-regular-1150218.pdf"
HAZARD_PDF = ROOT / "source-pdfs" / "motorcycle-hazard-1130816.pdf"
CONTEXT_PDF = ROOT / "source-pdfs" / "motorcycle-context-zh.pdf"
DATA_FILE = ROOT / "public" / "data" / "question-bank.json"
REGULAR_IMAGE_DIR = ROOT / "public" / "assets" / "questions" / "regular"
CONTEXT_IMAGE_DIR = ROOT / "public" / "assets" / "questions" / "context"

FULLWIDTH_TRANSLATION = str.maketrans(
    {
        "（": "(",
        "）": ")",
        "１": "1",
        "２": "2",
        "３": "3",
        "０": "0",
        "Ｃ": "C",
    }
)

CATEGORY_RANGES = (
    (1, 121, "正確觀念與態度"),
    (122, 480, "安全駕駛能力"),
    (481, 572, "主動停讓文化"),
    (573, 806, "安全駕駛能力"),
)

META_LINES = {
    "題號 答案 題目內容",
    "題號答案題目內容",
    "題號 答案 題目 影片編號",
    "題號答案題目影片編號",
    "機車駕照筆試題庫",
    "正確觀念與態度",
    "主動停讓文化",
    "安全駕駛能力",
}


def normalize_text(value: str) -> str:
    value = value.translate(FULLWIDTH_TRANSLATION)
    value = value.replace("？?", "？").replace("??", "？")
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", value)
    value = re.sub(r"\s+([，。？！；：、)])", r"\1", value)
    value = re.sub(r"([(])\s+", r"\1", value)
    return value.strip()


def is_metadata_line(line: str) -> bool:
    value = normalize_text(line)
    compact = value.replace(" ", "")
    if not compact:
        return True
    if compact in META_LINES:
        return True
    if compact.startswith("機車駕照筆試題庫115."):
        return True
    if re.fullmatch(r"[—-]?\d+[—-]?", compact):
        return True
    if compact.startswith("━━━━"):
        return True
    return False


def split_options(raw: str) -> tuple[str, list[str]]:
    text = normalize_text(raw)
    markers = list(re.finditer(r"\(([123])\)", text))
    if len(markers) < 3:
        raise ValueError(f"Could not find three options: {text[:180]}")
    stem = text[: markers[0].start()].strip()
    options: list[str] = []
    for index, marker in enumerate(markers[:3]):
        end = markers[index + 1].start() if index + 1 < 3 else len(text)
        options.append(text[marker.end() : end].strip().rstrip("。"))
    return stem, options


def category_for(number: int) -> str:
    for start, end, category in CATEGORY_RANGES:
        if start <= number <= end:
            return category
    raise ValueError(f"Question {number} is outside the known category ranges")


def page_for_offset(offsets: list[tuple[int, int, int]], offset: int) -> int:
    for page_number, start, end in offsets:
        if start <= offset < end:
            return page_number
    return offsets[-1][0]


def extract_page_text(page: Any, *, preserve_unicode_chunks: bool = False) -> str:
    if not preserve_unicode_chunks:
        return page.extract_text() or ""

    # The hazard PDF's top-level text merger corrupts its Traditional Chinese
    # Type0 font even though the individual visitor chunks are correctly mapped
    # through the embedded ToUnicode CMap. Joining those chunks preserves both
    # the original line breaks and the intended Unicode text.
    chunks: list[str] = []
    page.extract_text(visitor_text=lambda text, *_: chunks.append(text))
    return "".join(chunks)


def concatenate_pages(
    reader: PdfReader, *, preserve_unicode_chunks: bool = False
) -> tuple[str, list[tuple[int, int, int]]]:
    texts = [
        extract_page_text(page, preserve_unicode_chunks=preserve_unicode_chunks)
        for page in reader.pages
    ]
    offsets: list[tuple[int, int, int]] = []
    cursor = 0
    for page_number, text in enumerate(texts, start=1):
        offsets.append((page_number, cursor, cursor + len(text) + 1))
        cursor += len(text) + 1
    return "\n".join(texts), offsets


def clean_segment(segment: str) -> str:
    return " ".join(line.strip() for line in segment.splitlines() if not is_metadata_line(line))


def prepare_asset_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for stale in path.glob("*.png"):
        stale.unlink()


def extract_regular_images() -> dict[int, list[str]]:
    prepare_asset_dir(REGULAR_IMAGE_DIR)
    images_by_question: dict[int, list[str]] = defaultdict(list)

    with pdfplumber.open(REGULAR_PDF) as pdf:
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=1, y_tolerance=3, use_text_flow=False)
            question_words = [
                word
                for word in words
                if re.fullmatch(r"\d{1,3}", word["text"])
                # Question numbers sit in the first PDF column (x ~= 37).
                # The answer column at x ~= 83 also contains 1/2/3 and must not
                # be mistaken for a source question number.
                and 0 <= word["x0"] <= 65
                and 20 <= word["top"] <= page.height - 20
            ]
            for image in sorted(page.images, key=lambda item: (item["top"], item["x0"])):
                center_y = (image["top"] + image["bottom"]) / 2
                nearest = min(
                    question_words,
                    key=lambda word: abs(center_y - ((word["top"] + word["bottom"]) / 2)),
                    default=None,
                )
                if nearest is None:
                    continue
                number = int(nearest["text"])
                if not 1 <= number <= 806:
                    continue
                index = len(images_by_question[number]) + 1
                filename = f"regular-{number:03d}-{index}.png"
                output = REGULAR_IMAGE_DIR / filename
                bbox = (image["x0"], image["top"], image["x1"], image["bottom"])
                page.crop(bbox).to_image(resolution=240).save(str(output))
                images_by_question[number].append(f"/assets/questions/regular/{filename}")

    return dict(images_by_question)


def parse_regular_questions(images_by_question: dict[int, list[str]]) -> list[dict[str, Any]]:
    reader = PdfReader(REGULAR_PDF)
    full_text, offsets = concatenate_pages(reader)
    starts = list(re.finditer(r"(?m)^\s*(\d{1,3})\s+([123])\s+", full_text))
    questions: list[dict[str, Any]] = []

    for index, match in enumerate(starts):
        number = int(match.group(1))
        if not 1 <= number <= 806:
            continue
        end = starts[index + 1].start() if index + 1 < len(starts) else len(full_text)
        stem, options = split_options(clean_segment(full_text[match.end() : end]))
        images = images_by_question.get(number, [])
        image_only_options = len(images) == 3 and sum(len(option) for option in options) <= 12
        questions.append(
            {
                "id": f"regular-{number:03d}",
                "sourceNumber": number,
                "kind": "regular",
                "category": category_for(number),
                "prompt": stem or "請依圖示選出正確答案。",
                "options": options,
                "answerIndex": int(match.group(2)) - 1,
                "promptImages": [] if image_only_options else images,
                "optionImages": images if image_only_options else [],
                "videoId": None,
                "videoUrl": None,
                "source": {
                    "file": REGULAR_PDF.name,
                    "page": page_for_offset(offsets, match.start()),
                },
            }
        )

    return questions


def extract_context_image(page: pdfplumber.page.Page, page_number: int) -> str:
    images = list(page.images)
    if not images:
        raise ValueError(f"Context page {page_number} has no illustration")
    if page_number <= 60:
        selected = max(images, key=lambda item: item["width"] * item["height"])
    else:
        candidates = [
            image
            for image in images
            if image["width"] < page.width * 0.95 and image["height"] < page.height * 0.95
        ]
        selected = max(
            candidates or images,
            key=lambda item: (item.get("srcsize", (0, 0))[0] * item.get("srcsize", (0, 0))[1]),
        )
    filename = f"context-{page_number:03d}.png"
    bbox = (selected["x0"], selected["top"], selected["x1"], selected["bottom"])
    page.crop(bbox).to_image(resolution=220).save(str(CONTEXT_IMAGE_DIR / filename))
    return f"/assets/questions/context/{filename}"


def parse_context_questions() -> list[dict[str, Any]]:
    prepare_asset_dir(CONTEXT_IMAGE_DIR)
    reader = PdfReader(CONTEXT_PDF)
    questions: list[dict[str, Any]] = []

    with pdfplumber.open(CONTEXT_PDF) as visual_pdf:
        for page_number, (page, visual_page) in enumerate(zip(reader.pages, visual_pdf.pages), start=1):
            raw = (page.extract_text() or "").translate(FULLWIDTH_TRANSLATION)
            image_url = extract_context_image(visual_page, page_number)
            if page_number <= 60:
                header = re.search(r"【情境式題目】\s*(\d{3})\s*\(\s*([123])\s*\)", raw)
                if not header:
                    raise ValueError(f"Could not parse context header on page {page_number}")
                source_number = int(header.group(1))
                answer_index = int(header.group(2)) - 1
                stem, options = split_options(raw[header.end() :])
                series = "a"
            else:
                answer = re.search(r"答案\s*[:：]\s*([123])", raw)
                prompt_match = re.search(r"(?ms)^\s*(\d{1,2})\.(.*?)(?=\n\s*答案\s*[:：])", raw)
                if not answer or not prompt_match:
                    raise ValueError(f"Could not parse context page {page_number}")
                source_number = int(prompt_match.group(1))
                answer_index = int(answer.group(1)) - 1
                if prompt_match.start() > 0:
                    option_area = raw[: prompt_match.start()]
                    _, options = split_options(option_area)
                    stem = normalize_text(prompt_match.group(2))
                else:
                    stem, options = split_options(prompt_match.group(2))
                series = "b"

            questions.append(
                {
                    "id": f"context-{series}-{source_number:03d}",
                    "sourceNumber": source_number,
                    "kind": "context",
                    "category": "危險感知能力",
                    "prompt": stem,
                    "options": options,
                    "answerIndex": answer_index,
                    "promptImages": [image_url],
                    "optionImages": [],
                    "videoId": None,
                    "videoUrl": None,
                    "source": {"file": CONTEXT_PDF.name, "page": page_number},
                }
            )

    return questions


def extract_hazard_links(reader: PdfReader) -> list[str]:
    links: list[str] = []
    for page in reader.pages:
        for annotation_ref in page.get("/Annots") or []:
            annotation = annotation_ref.get_object()
            uri = annotation.get("/A", {}).get("/URI")
            if uri and "space2.thb.gov.tw" in str(uri):
                links.append(str(uri))
    return links


def parse_hazard_questions() -> list[dict[str, Any]]:
    reader = PdfReader(HAZARD_PDF)
    full_text, offsets = concatenate_pages(reader, preserve_unicode_chunks=True)
    starts = list(re.finditer(r"(?m)^\s*(\d{3})\s+([123])\s+", full_text))
    links = extract_hazard_links(reader)
    questions: list[dict[str, Any]] = []

    for index, match in enumerate(starts):
        number = int(match.group(1))
        if not 1 <= number <= 126:
            continue
        end = starts[index + 1].start() if index + 1 < len(starts) else len(full_text)
        raw_segment = full_text[match.end() : end]
        video_matches = list(re.finditer(r"\b(\d{4})\b", raw_segment))
        if not video_matches:
            raise ValueError(f"Missing video ID for hazard question {number}")
        video_match = video_matches[-1]
        video_id = video_match.group(1)
        question_segment = (
            raw_segment[: video_match.start()] + raw_segment[video_match.end() :]
        )
        stem, options = split_options(clean_segment(question_segment))
        questions.append(
            {
                "id": f"video-{number:03d}",
                "sourceNumber": number,
                "kind": "video",
                "category": "危險感知能力",
                "prompt": stem,
                "options": options,
                "answerIndex": int(match.group(2)) - 1,
                "promptImages": [],
                "optionImages": [],
                "videoId": video_id,
                "videoUrl": links[len(questions)] if len(questions) < len(links) else None,
                "source": {
                    "file": HAZARD_PDF.name,
                    "page": page_for_offset(offsets, match.start()),
                },
            }
        )

    return questions


def validate_questions(questions: list[dict[str, Any]]) -> None:
    ids = [question["id"] for question in questions]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Question IDs must be unique")
    for question in questions:
        if len(question["options"]) != 3:
            raise RuntimeError(f"{question['id']} does not have exactly three options")
        if not 0 <= question["answerIndex"] <= 2:
            raise RuntimeError(f"{question['id']} has an invalid answer")
        if not question["prompt"]:
            raise RuntimeError(f"{question['id']} has no prompt")
        for image_url in [*question["promptImages"], *question["optionImages"]]:
            if not (ROOT / "public" / image_url.lstrip("/")).exists():
                raise RuntimeError(f"Missing image asset {image_url}")


def build_question_bank() -> dict[str, Any]:
    regular_images = extract_regular_images()
    regular = parse_regular_questions(regular_images)
    context = parse_context_questions()
    video = parse_hazard_questions()
    questions = regular + context + video

    expected = {"regular": 806, "context": 120, "video": 126}
    actual = {kind: sum(question["kind"] == kind for question in questions) for kind in expected}
    if actual != expected:
        raise RuntimeError(f"Question count mismatch: expected {expected}, got {actual}")
    if sum(question["videoUrl"] is not None for question in video) != 126:
        raise RuntimeError("Expected 126 official video URLs")
    validate_questions(questions)

    return {
        "meta": {
            "version": "115.02.18",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalQuestions": len(questions),
            "counts": actual,
            "imageAssets": sum(
                len(question["promptImages"]) + len(question["optionImages"])
                for question in questions
            ),
            "officialFormat": {
                "effectiveDate": "2026-01-30",
                "totalQuestions": 50,
                "durationMinutes": 30,
                "scorePerQuestion": 2,
                "passingScore": 85,
                "composition": {
                    "video": 10,
                    "context": 5,
                    "正確觀念與態度": 12,
                    "主動停讓文化": 12,
                    "安全駕駛能力": 11,
                },
            },
            "sources": [
                {
                    "label": "交通部公路局機車題庫",
                    "url": "https://www.thb.gov.tw/News_Download.aspx?n=319&sms=12823",
                },
                {
                    "label": "115 年機車筆試新制說明",
                    "url": "https://www.motc.gov.tw/ch/app/news_list/view?id=14&module=news&serno=458293bf-095b-44ea-b1bb-978f920dd790",
                },
            ],
        },
        "questions": questions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate without rewriting JSON")
    args = parser.parse_args()

    bank = build_question_bank()
    if not args.check:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote {DATA_FILE.relative_to(ROOT)}")
    print(json.dumps(bank["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
