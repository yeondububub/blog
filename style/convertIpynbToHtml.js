/**
 * Jupyter Notebook (.ipynb) JSON 데이터를 파싱하여 HTML 마크업으로 변환합니다.
 * @param {string|object} fileContent - .ipynb 파일 내용(JSON 문자열 또는 객체)
 * @returns {string} 렌더링 가능한 HTML 마크업 문자열
 */
function convertIpynbToHtml(fileContent) {
  const notebook =
    typeof fileContent === "string" ? JSON.parse(fileContent) : fileContent;
  const cells = notebook.cells || [];
  let htmlContent = "";

  const getText = (val) => {
    if (!val) return "";
    if (Array.isArray(val)) return val.join("");
    return String(val);
  };

  cells.forEach((cell) => {
    if (cell.cell_type === "markdown") {
      // 1. 마크다운 셀: 이미지 태그 변환 후 marked 파서 실행
      const markdownText = getText(cell.source);
      const markdownTextConverted = convertSourceToImage(markdownText);
      const markdownTextConvertedImg = marked.parse(markdownTextConverted);
      if (
        markdownTextConvertedImg !== "" &&
        markdownTextConvertedImg !== undefined
      ) {
        htmlContent += `<div class="markdown-cell">${markdownTextConvertedImg}</div>`;
      }
    } else if (cell.cell_type === "code") {
      // 2. 파이썬 코드 셀: 특수 문자 이스케이프 및 코드 블록 생성
      const codeText = escapeHtml(getText(cell.source));
      htmlContent += `<pre class="code-cell"><code class="language-python">${codeText}</code></pre>`;

      // 3. 코드 실행 출력(Outputs) 결과 렌더링
      if (cell.outputs && cell.outputs.length > 0) {
        cell.outputs.forEach((output) => {
          if (output.data || output.text) {
            if (output.data) {
              if (
                output.output_type === "execute_result" ||
                output.output_type === "display_data" ||
                output.output_type === "stream"
              ) {
                if (output.data["text/html"]) {
                  htmlContent += `<div class="output-html">${getText(
                    output.data["text/html"]
                  )}</div>`;
                } else if (output.data["image/png"]) {
                  htmlContent += `<div class="output-image"><img src="data:image/png;base64,${getText(
                    output.data["image/png"]
                  ).trim()}" alt="output image" class="output-img" /></div>`;
                } else if (output.data["image/jpeg"]) {
                  htmlContent += `<div class="output-image"><img src="data:image/jpeg;base64,${getText(
                    output.data["image/jpeg"]
                  ).trim()}" alt="output image" class="output-img" /></div>`;
                } else if (output.data["text/plain"]) {
                  htmlContent += `<pre class="output-text">${escapeHtml(
                    getText(output.data["text/plain"])
                  )}</pre>`;
                }
              }
            }
            if (output.text) {
              htmlContent += `<pre class="output-text">${escapeHtml(
                getText(output.text)
              )}</pre>`;
            }
          } else if (output.output_type === "error") {
            const tracebackText = Array.isArray(output.traceback)
              ? output.traceback.join("\n")
              : output.traceback || "";
            htmlContent += `<pre class="error output-text">${escapeHtml(
              tracebackText
            )}</pre>`;
          }
        });
      }
    }
  });

  return htmlContent;
}

// 하위 호환성을 위한 별칭 유지
const convertIpynvToHtml = convertIpynbToHtml;