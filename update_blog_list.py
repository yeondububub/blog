#!/usr/bin/env python3
"""
config.js의 categoriesConfig 설정을 읽어 블로그 포스트 폴더 및 메뉴 폴더를 스캔하고
data/local_blogList.json 및 data/local_blogMenu.json 파일을 자동 생성하는 스크립트입니다.
"""

import json
import os
import re
import sys
import unicodedata
from pathlib import Path

# 블로그 루트 디렉터리 기준 경로 설정
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CONFIG_PATH = BASE_DIR / "config.js"
MENU_FOLDER = "menu"

# Linux ext4(GitHub Actions ubuntu-latest) 단일 파일명 최대 바이트 제한
MAX_FILENAME_UTF8_BYTES = 255

# 포스트 파일명 정규식 패턴: [YYYYMMDD]_[제목]_[카테고리]_[썸네일]_[설명](_[저자ID]).(md|ipynb)
POST_FILENAME_REGEX = re.compile(
    r"^\[(\d{8})\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\](?:_\[(.*?)\])?\.(md|ipynb)$"
)


def normalize_nfc(text: str) -> str:
    """macOS 파일 시스템의 NFD 한글 자모 분리를 표준 NFC 형태로 정규화합니다."""
    return unicodedata.normalize("NFC", text)


def load_config_from_js() -> tuple[list[str], list[str]]:
    """config.js의 categoriesConfig에서 포스트 폴더 목록과 메뉴 정렬 순서를 추출합니다."""
    default_folders = ["backend", "ai", "development", "blog", "ios", "security"]
    default_menus = [
        "Backend.md",
        "AI.md",
        "Development.md",
        "Diary.md",
        "iOS.md",
        "Security.md",
        "About.md",
    ]

    if not CONFIG_PATH.is_file():
        return default_folders, default_menus

    content = CONFIG_PATH.read_text(encoding="utf-8")
    block_match = re.search(
        r"const\s+categoriesConfig\s*=\s*\[(.*?)\];", content, re.DOTALL
    )
    if not block_match:
        return default_folders, default_menus

    block = block_match.group(1)
    item_pattern = re.compile(
        r"\{\s*menu:\s*[\"']([^\"']+)[\"']\s*,\s*folder:\s*(?:[\"']([^\"']*)[\"']|null)",
        re.DOTALL,
    )

    folders: list[str] = []
    menus: list[str] = []
    for match in item_pattern.finditer(block):
        menu_name, folder_name = match.group(1), match.group(2)
        menus.append(menu_name)
        if folder_name:
            folders.append(folder_name)

    return (folders or default_folders), (menus or default_menus)


def generate_blog_list(post_folders: list[str]) -> list[dict[str, str]]:
    """카테고리 폴더를 순회하며 유효한 블로그 포스트 목록을 생성합니다."""
    posts: list[dict[str, str]] = []
    oversized_files: list[tuple[str, int]] = []

    for folder in post_folders:
        folder_path = BASE_DIR / folder
        if not folder_path.is_dir():
            continue

        for entry in os.listdir(folder_path):
            filename = normalize_nfc(entry)
            if not POST_FILENAME_REGEX.match(filename):
                continue

            relative_path = f"{folder}/{filename}"
            byte_length = len(filename.encode("utf-8"))
            if byte_length > MAX_FILENAME_UTF8_BYTES:
                oversized_files.append((relative_path, byte_length))

            posts.append(
                {
                    "name": filename,
                    "path": relative_path,
                    "download_url": relative_path,
                }
            )

    if oversized_files:
        for path, byte_length in oversized_files:
            print(
                f"ERROR: '{path}' 파일명이 UTF-8 기준 {byte_length} bytes로 "
                f"Linux 제한({MAX_FILENAME_UTF8_BYTES} bytes)을 초과했습니다.",
                file=sys.stderr,
            )
        sys.exit(1)

    # 파일명 기준 내림차순 정렬 (최신 작성일 포스트가 상단에 위치)
    posts.sort(key=lambda item: item["name"], reverse=True)
    return posts


def generate_menu_list(menu_order: list[str]) -> list[dict[str, str]]:
    """menu 폴더를 스캔하여 메뉴 목록을 생성합니다."""
    menu_dir = BASE_DIR / MENU_FOLDER
    if not menu_dir.is_dir():
        return []

    menus: list[dict[str, str]] = []
    for entry in os.listdir(menu_dir):
        filename = normalize_nfc(entry)
        if not filename.endswith(".md") or filename.startswith("."):
            continue

        # menu_order에 대소문자만 다른 항목이 있으면 표준 메뉴명으로 맞춤
        canonical_name = next(
            (m for m in menu_order if m.lower() == filename.lower()),
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
            return menu_order.index(item["name"])
        except ValueError:
            return 9999

    menus.sort(key=sort_key)
    return menus


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    post_folders, menu_order = load_config_from_js()

    posts = generate_blog_list(post_folders)
    blog_list_path = DATA_DIR / "local_blogList.json"
    with open(blog_list_path, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
        f.write("\n")

    menus = generate_menu_list(menu_order)
    blog_menu_path = DATA_DIR / "local_blogMenu.json"
    with open(blog_menu_path, "w", encoding="utf-8") as f:
        json.dump(menus, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Updated {blog_list_path.relative_to(BASE_DIR)}: {len(posts)} posts")
    print(f"Updated {blog_menu_path.relative_to(BASE_DIR)}: {len(menus)} menus")


if __name__ == "__main__":
    main()
