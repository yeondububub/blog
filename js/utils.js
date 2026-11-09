/**
 * 현재 브라우저 URL에서 GitHub Pages의 username과 repositoryName을 추출합니다.
 * @returns {{ username: string, repositoryName: string }}
 */
function extractFromUrl() {
  const url = new URL(window.location.href);

  // 호스트 서브도메인에서 GitHub username 추출 (예: "username.github.io" -> "username")
  const hostnameParts = url.hostname.split(".");
  const username = hostnameParts.length > 2 ? hostnameParts[0] : "";

  // pathname의 첫 번째 경로 세그먼트에서 repositoryName 추출 (예: "/blog" -> "blog")
  const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
  const repositoryName = pathParts.length > 0 ? pathParts[0] : "";

  return {
    username: username,
    repositoryName: repositoryName,
  };
}

/**
 * 마크다운 텍스트 내 Base64 인라인 이미지를 HTML <img> 태그로 변환합니다.
 * @param {string} source - 원본 마크다운 텍스트
 * @returns {string} 변환된 텍스트
 */
function convertSourceToImage(source) {
  const base64ImageRegex = /!\[.*?\]\(data:image\/(png|jpeg);base64,(.*?)\)/g;

  return source.replace(base64ImageRegex, (match, fileType, imageData) => {
    return `<img src="data:image/${fileType};base64,${imageData}" alt="Embedded Image" />`;
  });
}

/**
 * XSS 방지를 위해 특수 HTML 문자를 엔티티 코드로 변환합니다.
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 안전하게 변환된 텍스트
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 블로그 포스트 파일명 규칙을 정규식으로 파싱하여 메타데이터 객체를 반환합니다.
 * 파일명 형식: [YYYYMMDD]_[제목]_[카테고리]_[썸네일]_[설명]_[저자ID].(md|ipynb)
 * @param {string} filename - 파싱할 파일명
 * @returns {object|null} 추출된 포스트 메타데이터
 */
function extractFileInfo(filename) {
  if (!filename) return null;
  const normalizedFilename = filename.normalize("NFC");
  const regex =
    /^\[(\d{8})\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\]_\[(.*?)\](?:\_\[(.*?)\])?\.(md|ipynb)$/;
  const matches = normalizedFilename.match(regex);

  if (matches) {
    const title = matches[2];
    // 썸네일이 비어 있을 때 제목 문자열 기반으로 일관된 기본 썸네일(thumb1.png ~ thumb7.png) 매핑
    const titleCharCodeSum = Array.from(title).reduce(
      (acc, char) => acc + char.charCodeAt(0),
      0
    );
    const defaultThumbIndex = (titleCharCodeSum % 7) + 1;

    return {
      date: matches[1],
      title: title,
      category: matches[3],
      thumbnail: matches[4]
        ? "img/" + matches[4]
        : `img/thumb${defaultThumbIndex}.png`,
      description: matches[5],
      author: matches[6] ? parseInt(matches[6], 10) : 0,
      fileType: matches[7],
    };
  }
  return null;
}

/**
 * YYYYMMDD 형식의 날짜 문자열을 YYYY/MM/DD 형식으로 변환합니다.
 * @param {string} dateString - 8자리 날짜 문자열
 * @returns {string} 포맷팅된 날짜 문자열
 */
function formatDate(dateString) {
  if (!dateString || dateString.length < 8) return "";
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);

  return `${year}/${month}/${day}`;
}

/**
 * 포스트 객체 또는 파일 경로를 전달받아 로컬 및 배포 환경에서 유효한 fetch URL을 반환합니다.
 * @param {object|string} post - 포스트 객체 또는 상대/절대 URL 문자열
 * @returns {string} 정규화된 fetch URL
 */
function getPostDownloadUrl(post) {
  if (!post) return "";
  const rawUrl = typeof post === "string" ? post : (post.download_url || post.path || "");
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  const cleanPath = rawUrl.replace(/^\/+/, "");
  const pathDir = window.location.pathname.replace(/\/[^\/]*\.[^\/]*$/, "").replace(/\/+$/, "") + "/";
  return `${window.location.origin}${pathDir}${cleanPath}`;
}
