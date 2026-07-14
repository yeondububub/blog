# 개발 BLOG

## 블로그 작성법
1. 글은 blog 폴더에 작성하며, `[date]_[title]_[category]_[thumnail]_[description].md` 형식으로 작성합니다.
2. 썸네일을 사용하지 않는 경우, `[date]_[title]_[category]_[].md` 형식으로 작성합니다.
3. `data/localBlogList.json`을 수정하여 화면에 출력할 글을 관리합니다.

## 메뉴 관리
우측 상단의 메뉴를 관리하는 방법은 다음과 같습니다.
1. menu 폴더에 `사용하고싶은 메뉴 이름.md` 형식으로 저장하면 메뉴로 생성됩니다.
2. `data/local_blogMenu.json`을 관리하여 화면에 출력할 메뉴를 관리합니다.


## 디자인 수정
- `style/globalStyle.js` 파일을 수정하여 전체적인 스타일을 수정할 수 있습니다.
- Tailwind CSS를 이용하여 손쉽게 나만의 스타일을 적용할 수 있습니다.
