/* ============================================================
   ocr.js — 图片上传、多模态、OCR、文档文本提取
   ============================================================ */

const MediaHandler = (() => {
    // ── 多模态模型检测 ──
    var MULTIMODAL_KEYWORDS = [
        'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1',
        'claude-3', 'claude-3.5', 'claude-4', 'claude-3-5',
        'gemini-1.5', 'gemini-2', 'gemini-pro-vision',
        'qwen-vl', 'glm-4v', 'vision', 'multimodal',
        'doubao-vision', 'hunyuan-vision', 'deepseek-v4',
    ];

    function isMultimodalModel(model) {
        if (!model) return false;
        var m = model.toLowerCase();
        for (var i = 0; i < MULTIMODAL_KEYWORDS.length; i++) {
            if (m.indexOf(MULTIMODAL_KEYWORDS[i]) >= 0) return true;
        }
        return false;
    }

    // ── 文件读取 ──
    function readFileAsBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                // Strip the data:...;base64, prefix
                var base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = function () { reject(new Error('读取文件失败')); };
            reader.readAsDataURL(file);
        });
    }

    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('读取文件失败')); };
            reader.readAsText(file);
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('读取文件失败')); };
            reader.readAsArrayBuffer(file);
        });
    }

    // ── 图片 Base64 (含 data: 前缀，用于 image_url) ──
    function readImageAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('读取图片失败')); };
            reader.readAsDataURL(file);
        });
    }

    // ── 文档文本提取 ──
    function extractFileText(file) {
        var ext = (file.name || '').split('.').pop().toLowerCase();

        // Plain text files
        if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json' || ext === 'xml' || ext === 'html' || ext === 'css' || ext === 'js' || ext === 'py' || ext === 'c' || ext === 'cpp' || ext === 'h' || ext === 'java' || ext === 'ts' || ext === 'tsx' || ext === 'jsx' || ext === 'yaml' || ext === 'yml' || ext === 'toml' || ext === 'ini' || ext === 'cfg' || ext === 'log' || ext === 'sql') {
            return readFileAsText(file).then(function (text) {
                return { fileName: file.name, text: text.trim().substring(0, 12000) };
            });
        }

        // docx → mammoth.js
        if (ext === 'docx') {
            if (typeof mammoth === 'undefined') {
                return Promise.reject(new Error('mammoth.js 未加载，请刷新页面后重试'));
            }
            return readFileAsArrayBuffer(file).then(function (buf) {
                return mammoth.extractRawText({ arrayBuffer: buf });
            }).then(function (result) {
                return { fileName: file.name, text: result.value.trim().substring(0, 12000) };
            });
        }

        // xlsx → SheetJS
        if (ext === 'xlsx' || ext === 'xls') {
            if (typeof XLSX === 'undefined') {
                return Promise.reject(new Error('SheetJS 未加载，请刷新页面后重试'));
            }
            return readFileAsArrayBuffer(file).then(function (buf) {
                var workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
                var text = '';
                workbook.SheetNames.forEach(function (name) {
                    var sheet = workbook.Sheets[name];
                    var csv = XLSX.utils.sheet_to_csv(sheet);
                    if (csv.trim()) text += '--- ' + name + ' ---\n' + csv + '\n\n';
                });
                return { fileName: file.name, text: text.trim().substring(0, 12000) };
            });
        }

        // Unsupported format
        return Promise.reject(new Error('不支持的文件格式: .' + ext + '（支持 txt/md/docx/xlsx/csv 及常见代码文件）'));
    }

    // ── OCR: 通过 Vision API 提取图片文字 ──
    function ocrImage(base64, config) {
        var url = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';

        var messages = [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
                { type: 'text', text: '请仔细识别并提取这张图片中的所有文字内容。只输出图片中的文字，不要添加任何解释、说明或额外评论。如果图片中没有文字，请回复"（无文字）"。' },
            ],
        }];

        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.apiKey,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o',
                messages: messages,
                stream: false,
                temperature: 0.1,
                max_tokens: 2048,
            }),
        }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (t) {
                    var msg = 'OCR HTTP ' + res.status;
                    try { msg = JSON.parse(t).error.message || msg; } catch (e) {}
                    throw new Error(msg);
                });
            }
            return res.json();
        }).then(function (data) {
            var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
            return text.trim();
        });
    }

    // ── 构建多模态消息 content 数组 ──
    function buildMultimodalContent(text, dataUrls) {
        var content = [];
        for (var i = 0; i < dataUrls.length; i++) {
            content.push({
                type: 'image_url',
                image_url: { url: dataUrls[i] },
            });
        }
        if (text && text.trim()) {
            content.push({ type: 'text', text: text.trim() });
        } else if (content.length > 0) {
            content.push({ type: 'text', text: '请描述这张图片的内容。' });
        }
        return content;
    }

    /**
     * 处理媒体文件（图片 + 文档），返回处理后的消息内容
     * @returns {Promise<{content, displayImages, displayFiles, fileNames}>}
     */
    function processMedia(text, imageFiles, docFiles, config) {
        var hasImages = imageFiles && imageFiles.length > 0;
        var hasFiles = docFiles && docFiles.length > 0;

        if (!hasImages && !hasFiles) {
            return Promise.resolve({ content: text, displayImages: [], displayFiles: [], fileNames: [] });
        }

        var imagePromise = Promise.resolve([]);
        var filePromise = Promise.resolve([]);

        if (hasImages) {
            imagePromise = Promise.all(imageFiles.map(function (f) {
                return readImageAsDataUrl(f).then(function (dataUrl) {
                    return { dataUrl: dataUrl, base64: dataUrl.split(',')[1] };
                });
            }));
        }

        if (hasFiles) {
            filePromise = Promise.all(docFiles.map(function (f) {
                return extractFileText(f).catch(function (err) {
                    return { fileName: f.name, text: '[提取失败: ' + err.message + ']' };
                });
            }));
        }

        return Promise.all([imagePromise, filePromise]).then(function (results) {
            var imageData = results[0];
            var fileResults = results[1];
            var fileNames = fileResults.map(function (r) { return r.fileName; });
            var dataUrls = imageData.map(function (d) { return d.dataUrl; });
            var base64List = imageData.map(function (d) { return d.base64; });

            var finalText = text || '';
            var extraParts = [];

            // 非多模态模型 + 有图片 → OCR 提取文字
            if (hasImages && !isMultimodalModel(config.model)) {
                // OCR each image
                var ocrPromises = base64List.map(function (b64) {
                    return ocrImage(b64, config).catch(function () {
                        return '[图片文字提取失败]';
                    });
                });
                return Promise.all(ocrPromises).then(function (ocrResults) {
                    extraParts.push('[图片文字]:\n' + ocrResults.join('\n\n'));
                    // 添加文档文字
                    for (var i = 0; i < fileResults.length; i++) {
                        extraParts.push('[文件: ' + fileResults[i].fileName + ']\n' + fileResults[i].text);
                    }
                    var combined = (finalText ? finalText + '\n\n' : '') + extraParts.join('\n\n');
                    return {
                        content: combined,
                        displayImages: imageFiles.map(function (f) { return URL.createObjectURL(f); }),
                        displayFiles: docFiles,
                        fileNames: fileNames,
                    };
                });
            }

            // 多模态模型（或有文件无图片）
            if (hasFiles) {
                for (var j = 0; j < fileResults.length; j++) {
                    extraParts.push('[文件: ' + fileResults[j].fileName + ']\n' + fileResults[j].text);
                }
            }

            if (hasImages && isMultimodalModel(config.model)) {
                // 多模态：图片放进 content 数组
                var combined = finalText;
                if (extraParts.length > 0) {
                    combined = (combined ? combined + '\n\n' : '') + extraParts.join('\n\n');
                }
                return {
                    content: buildMultimodalContent(combined, dataUrls),
                    displayImages: imageFiles.map(function (f) { return URL.createObjectURL(f); }),
                    displayFiles: [],
                    fileNames: fileNames,
                };
            }

            // 有文件无图片
            var combined2 = finalText;
            if (extraParts.length > 0) {
                combined2 = (combined2 ? combined2 + '\n\n' : '') + extraParts.join('\n\n');
            }
            return {
                content: combined2,
                displayImages: [],
                displayFiles: docFiles,
                fileNames: fileNames,
            };
        });
    }

    return {
        isMultimodalModel: isMultimodalModel,
        readFileAsBase64: readFileAsBase64,
        readImageAsDataUrl: readImageAsDataUrl,
        extractFileText: extractFileText,
        ocrImage: ocrImage,
        buildMultimodalContent: buildMultimodalContent,
        processMedia: processMedia,
    };
})();
