function convertIpynvToHtml(fileContent) {
    /*
    주피터 노트북을 마크업으로 변환하는 함수, style/blogContentsStyle.js 에서 사용하는 함수입니다.
    */
    const notebook = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
    const cells = notebook.cells;
    let htmlContent = '';

    const getText = (val) => {
        if (!val) return '';
        if (Array.isArray(val)) return val.join('');
        return String(val);
    };

    cells.forEach(cell => {
        if (cell.cell_type === 'markdown') {
            // 마크다운 셀 처리
            const markdownText = getText(cell.source);
            const markdownTextConverted = convertSourceToImage(markdownText);
            const markdownTextConvertedImg = marked.parse(markdownTextConverted);
            if (markdownTextConvertedImg !== '' && markdownTextConvertedImg !== undefined) {
                htmlContent += `<div class="markdown-cell">${markdownTextConvertedImg}</div>`;
            }
        } else if (cell.cell_type === 'code') {
            // 코드 셀 처리
            // 셀 안에 html 태그가 들어가는 경우가 있어서 이스케이프 처리
            const codeText = escapeHtml(getText(cell.source));
            htmlContent += `<pre class="code-cell"><code class="language-python">${codeText}</code></pre>`;

            // 코드 출력 처리
            if (cell.outputs && cell.outputs.length > 0) { 
                cell.outputs.forEach(output => {
                    // output.data가 존재하는지 확인
                    if (output.data || output.text) {
                        if (output.data) {
                            if (output.output_type === 'execute_result' || output.output_type === 'display_data' || output.output_type === 'stream') {
                                if (output.data['text/html']) {
                                    // <map object>가 들어오는 경우가 있어서 이스케이프 처리하지 않음
                                    htmlContent += `<div class="output-html">${getText(output.data['text/html'])}</div>`;
                                } else if (output.data['image/png']) {
                                    htmlContent += `<div class="output-image"><img src="data:image/png;base64,${getText(output.data['image/png']).trim()}" alt="output image" class="output-img" /></div>`;
                                } else if (output.data['image/jpeg']) {
                                    htmlContent += `<div class="output-image"><img src="data:image/jpeg;base64,${getText(output.data['image/jpeg']).trim()}" alt="output image" class="output-img" /></div>`;
                                } else if (output.data['text/plain']) {
                                    // pandas의 DataFrame이 들어오는 경우가 있어서 이스케이프 처리하지 않음
                                    htmlContent += `<pre class="output-text">${escapeHtml(getText(output.data['text/plain']))}</pre>`;
                                }
                            }
                        }
                        if (output.text) {
                            htmlContent += `<pre class="output-text">${escapeHtml(getText(output.text))}</pre>`;
                        }
                    } else if (output.output_type === 'error') {
                        const tracebackText = Array.isArray(output.traceback) ? output.traceback.join('\n') : (output.traceback || '');
                        htmlContent += `<pre class="error output-text">${escapeHtml(tracebackText)}</pre>`;
                    }
                });
            }
        }
    });

    return htmlContent;
}