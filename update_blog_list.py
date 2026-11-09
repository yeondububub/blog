#!/usr/bin/env python3
"""
블로그 포스트 폴더 및 메뉴 폴더를 스캔하여
data/local_blogList.json 및 data/local_blogMenu.json 파일을 자동 생성하는 스크립트입니다.
"""

import json
import os
import re
import unicodedata
from pathlib import Path

# 블로그 루트 디렉터리 기준 경로 설정
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# 스캔 대상 포스트 카테고리 디렉터리 목록
POST_FOLDERS = [
    "backend",
    "ai",
    "development",
    "ios",
    "security",
    "blog",
    "diary",
]

# 메뉴 디렉터리 및 정렬 순서 (config.js의 siteConfig.menuOrder와 동기화)
MENU_FOLDER = "menu"
MENU_ORDER = [
    "Backend.md",
    "AI.md",
    "Development.md",
    "Diary.md",
    "iOS.md",
    "Security.md",
    "About.md",
]

# 포스트 파일명 정규식 패턴: [YYYYMMDD]_[제목]_[카테고리]_[썸네일]_[설명](_[저자ID]).(md|ipynb)
POST_FILENAME_REGEX = re.compile(
    r"^\[(\d{8})\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\](?:_\[(.*?)\])?\.(md|ipynb)$"
)


def normalize_nfc(text: str) -> str:
    """macOS 파일 시스템의 NFD 한글 자모 분리를 표준 NFC 형태로 정규화합니다."""
    return unicodedata.normalize("NFC", text)


def generate_blog_list() -> list[dict[str, str]]:
    """카테고리 폴더를 순회하며 유효한 블로그 포스트 목록을 생성합니다."""
    posts: list[dict[str, str]] = []

    for folder in POST_FOLDERS:
        folder_path = BASE_DIR / folder
        if not folder_path.is_dir():
            continue

        for entry in os.listdir(folder_path):
            filename = normalize_nfc(entry)
            if not POST_FILENAME_REGEX.match(filename):
                continue

            relative_path = f"{folder}/{filename}"
            posts.append(
                {
                    "name": filename,
                    "path": relative_path,
                    "download_url": relative_path,
                }
            )

    # 파일명 기준 내림차순 정렬 (최신 작성일 포스트가 상단에 위치)
    posts.sort(key=lambda item: item["name"], reverse=True)
    return posts


def generate_menu_list() -> list[dict[str, str]]:
    """menu 폴더를 스캔하여 메뉴 목록을 생성합니다."""
    menu_dir = BASE_DIR / MENU_FOLDER
    if not menu_dir.is_dir():
        return []

    menus: list[dict[str, str]] = []
    for entry in os.listdir(menu_dir):
        filename = normalize_nfc(entry)
        if not filename.endswith(".md") or filename.startswith("."):
            continue

        # MENU_ORDER에 대소문자만 다른 항목이 있으면 표준 메뉴명으로 맞춤 (예: about.md -> About.md)
        canonical_name = next(
            (m for m in MENU_ORDER if m.lower() == filename.lower()),
            filename,
        )

        menus.append(
            {
                "name": canonical_name,
                "download_url": f"/{MENU_FOLDER}/{canonical_name}",
            }
        )

    def sort_key(item: dict[str, str]) -> int:
        try:
            return MENU_ORDER.index(item["name"])
        except ValueError:
            return 9999

    menus.sort(key=sort_key)
    return menus


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    posts = generate_blog_list()
    blog_list_path = DATA_DIR / "local_blogList.json"
    with open(blog_list_path, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
        f.write("\n")

    menus = generate_menu_list()
    blog_menu_path = DATA_DIR / "local_blogMenu.json"
    with open(blog_menu_path, "w", encoding="utf-8") as f:
        json.dump(menus, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Updated {blog_list_path.relative_to(BASE_DIR)}: {len(posts)} posts")
    print(f"Updated {blog_menu_path.relative_to(BASE_DIR)}: {len(menus)} menus")


if __name__ == "__main__":
    main()

