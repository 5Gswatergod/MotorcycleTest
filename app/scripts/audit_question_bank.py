from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "public" / "data" / "question-bank.json"
EXPECTED = {"regular": 806, "context": 120, "video": 126}


def check_url(url: str) -> tuple[str, int | str]:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": "Mozilla/5.0 RideReady question-bank audit"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read(1)
            return url, response.status
    except urllib.error.HTTPError as error:
        return url, error.code
    except Exception as error:  # pragma: no cover - depends on external network
        return url, type(error).__name__


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", action="store_true", help="Verify every official video URL")
    args = parser.parse_args()

    bank = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    questions = bank["questions"]
    counts = Counter(question["kind"] for question in questions)
    assert len(questions) == 1052, len(questions)
    assert counts == EXPECTED, counts
    assert len({question["id"] for question in questions}) == 1052

    missing_assets: list[str] = []
    for question in questions:
        assert len(question["options"]) == 3, question["id"]
        assert all(option.strip() for option in question["options"]), question["id"]
        assert question["answerIndex"] in (0, 1, 2), question["id"]
        assert question["source"]["page"] >= 1, question["id"]
        for asset in [*question["promptImages"], *question["optionImages"]]:
            if not (ROOT / "public" / asset.lstrip("/")).is_file():
                missing_assets.append(asset)
    assert not missing_assets, missing_assets[:10]

    video_urls = [
        question["videoUrl"] for question in questions if question["kind"] == "video"
    ]
    assert len(video_urls) == 126
    assert len(set(video_urls)) == 126
    assert all(url and url.startswith("https://space2.thb.gov.tw/") for url in video_urls)

    if args.network:
        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(check_url, video_urls))
        failures = [(url, status) for url, status in results if status not in range(200, 400)]
        assert not failures, failures
        print(f"Network check: {len(results)} / {len(video_urls)} official video URLs reachable")

    print(
        "Question-bank audit passed: "
        f"{len(questions)} questions, {len(video_urls)} video URLs, "
        f"{bank['meta']['imageAssets']} image assets"
    )


if __name__ == "__main__":
    main()
