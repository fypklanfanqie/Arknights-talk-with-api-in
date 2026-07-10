/* ============================================================
   codeHighlight.js — C/Python 语法高亮 + 物化公式渲染
   从 miniprogram/utils/codeHighlight.js 移植，适配 DOM 渲染
   ============================================================ */

var CodeHighlight = (() => {
    // ── VS Code Dark+ 颜色方案 ──
    var COLORS = {
        keyword:  '#569CD6',  // 蓝 — if else for while return ...
        string:   '#CE9178',  // 橙 — "hello"
        comment:  '#6A9955',  // 绿 — // /* */
        number:   '#B5CEA8',  // 浅绿 — 42 3.14
        function: '#DCDCAA',  // 黄 — main() printf()
        type:     '#4EC9B0',  // 青 — int float void
        macro:    '#C586C0',  // 紫 — #include #define
        default:  '#D4D4D4',  // 浅灰 — 默认
        bg:       '#1E1E1E',  // 背景
    };

    // ── C 语言词法规则 ──
    var C_KEYWORDS = [
        'auto','break','case','const','continue','default','do',
        'else','enum','extern','for','goto','if','register',
        'return','signed','sizeof','static','struct','switch',
        'typedef','union','unsigned','volatile','while',
    ];

    var C_TYPES = [
        'int','char','float','double','void','long','short',
        'size_t','FILE','NULL','true','false','bool',
        'int8_t','int16_t','int32_t','int64_t',
        'uint8_t','uint16_t','uint32_t','uint64_t',
    ];

    var C_FUNCTIONS = [
        'printf','scanf','malloc','free','calloc','realloc',
        'fopen','fclose','fread','fwrite','fprintf','fscanf',
        'sprintf','sscanf','strlen','strcpy','strcmp','strcat',
        'memcpy','memset','memmove','memcmp',
        'atoi','atof','atol','exit','abs','rand','srand',
        'sqrt','pow','sin','cos','tan','ceil','floor',
        'getchar','putchar','gets','puts','perror',
        'main','qsort','bsearch',
    ];

    var C_MACROS = [
        'include','define','ifdef','ifndef','if','else','elif',
        'endif','pragma','error','undef','line',
    ];

    // ── Python 词法规则 ──
    var PY_KEYWORDS = [
        'False','None','True','and','as','assert','async','await',
        'break','class','continue','def','del','elif','else',
        'except','finally','for','from','global','if','import',
        'in','is','lambda','nonlocal','not','or','pass',
        'raise','return','try','while','with','yield',
    ];

    var PY_BUILTINS = [
        'print','len','range','int','str','float','list','dict',
        'set','tuple','input','open','type','isinstance',
        'hasattr','getattr','setattr','super','self','cls',
        'enumerate','zip','map','filter','sorted','reversed',
        'any','all','max','min','sum','abs','round',
        'ord','chr','bin','hex','oct','format','next','iter',
        'id','dir','vars','help','exec','eval','compile',
        '__init__','__name__','__main__','__file__','__str__',
        'True','False','None',
    ];

    // ── 物化公式颜色 ──
    var SCIENCE_COLORS = {
        normal:   '#E8E4E0',
        sub:      '#7EC8E3',
        sup:      '#E8A87C',
        greek:    '#B5EAD7',
        operator: '#FFB7B2',
        number:   '#C7CEEA',
        unit:     '#FFDAC1',
    };

    var SCIENCE_LANGS = ['physics', 'chemistry', 'formula', 'math', 'science'];

    // ═══════════════════════════════════════════
    //  核心：将一段代码分词着色，返回 [[{text, color}]]
    // ═══════════════════════════════════════════
    function tokenize(code, language) {
        var isC = (language === 'c' || language === 'cpp' || language === 'c++');
        var isPy = (language === 'python' || language === 'py');

        if (!isC && !isPy) {
            var lines = code.split('\n');
            return lines.map(function (line) {
                return [{ text: line, color: COLORS.default }];
            });
        }

        // Step 1: 保护字符串
        var strings = [];
        var comments = [];
        code = protectStrings(code, strings);
        if (isC) code = protectCComments(code, comments);
        if (isPy) code = protectPyComments(code, comments);

        // Step 2: 按行分词着色
        var lines = code.split('\n');
        var result = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var tokens;

            if (isC && /^\s*#/.test(line)) {
                tokens = [{ text: line, color: COLORS.macro }];
            } else {
                tokens = tokenizeLine(line, isC ? 'c' : 'python');
            }
            tokens = restorePlaceholders(tokens, strings, comments);
            result.push(tokens);
        }

        return result;
    }

    function protectStrings(code, store) {
        code = code.replace(/"([^"\\]|\\.)*"/g, function (m) {
            store.push({ text: m, color: COLORS.string });
            return '\x00S' + (store.length - 1) + '\x00';
        });
        code = code.replace(/'([^'\\]|\\.)'/g, function (m) {
            store.push({ text: m, color: COLORS.string });
            return '\x00S' + (store.length - 1) + '\x00';
        });
        code = code.replace(/'''[\s\S]*?'''/g, function (m) {
            store.push({ text: m, color: COLORS.string });
            return '\x00S' + (store.length - 1) + '\x00';
        });
        code = code.replace(/"""[\s\S]*?"""/g, function (m) {
            store.push({ text: m, color: COLORS.string });
            return '\x00S' + (store.length - 1) + '\x00';
        });
        return code;
    }

    function protectCComments(code, store) {
        code = code.replace(/\/\*[\s\S]*?\*\//g, function (m) {
            store.push({ text: m, color: COLORS.comment });
            return '\x00C' + (store.length - 1) + '\x00';
        });
        code = code.replace(/\/\/[^\n]*/g, function (m) {
            store.push({ text: m, color: COLORS.comment });
            return '\x00C' + (store.length - 1) + '\x00';
        });
        return code;
    }

    function protectPyComments(code, store) {
        code = code.replace(/#[^\n]*/g, function (m) {
            store.push({ text: m, color: COLORS.comment });
            return '\x00C' + (store.length - 1) + '\x00';
        });
        return code;
    }

    function restorePlaceholders(tokens, strings, comments) {
        var result = [];
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            var text = t.text;
            var parts = splitByPlaceholder(text);
            for (var j = 0; j < parts.length; j++) {
                var p = parts[j];
                if (p.placeholder) {
                    if (p.type === 'S' && strings[p.index]) {
                        result.push({ text: strings[p.index].text, color: strings[p.index].color });
                    } else if (p.type === 'C' && comments[p.index]) {
                        result.push({ text: comments[p.index].text, color: comments[p.index].color });
                    } else {
                        result.push({ text: p.text, color: COLORS.default });
                    }
                } else {
                    result.push({ text: p.text, color: t.color });
                }
            }
        }
        return result;
    }

    function splitByPlaceholder(text) {
        var parts = [];
        var regex = /\x00([SC])(\d+)\x00/g;
        var lastIdx = 0;
        var match;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                parts.push({ text: text.slice(lastIdx, match.index), placeholder: false });
            }
            parts.push({
                text: match[0],
                placeholder: true,
                type: match[1],
                index: parseInt(match[2]),
            });
            lastIdx = regex.lastIndex;
        }
        if (lastIdx < text.length) {
            parts.push({ text: text.slice(lastIdx), placeholder: false });
        }
        return parts;
    }

    function tokenizeLine(line, lang) {
        if (!line) return [{ text: '', color: COLORS.default }];
        var tokens = [];
        var regex = lang === 'c' ? buildCRegex() : buildPythonRegex();
        var lastIdx = 0;
        var match;
        while ((match = regex.exec(line)) !== null) {
            if (match.index > lastIdx) {
                tokens.push({ text: line.slice(lastIdx, match.index), color: COLORS.default });
            }
            var color = classifyToken(match[0], lang);
            tokens.push({ text: match[0], color: color });
            lastIdx = regex.lastIndex;
        }
        if (lastIdx < line.length) {
            tokens.push({ text: line.slice(lastIdx), color: COLORS.default });
        }
        return tokens;
    }

    function buildCRegex() {
        return /0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\b[a-zA-Z_]\w*\b|#[ \t]*\w+|::|->|>=|<=|!=|==|\+=|-=|\*=|\/=|%=|&&|\|\||[(){}\[\];,:.*&|^~!<>=+\-/%]/g;
    }

    function buildPythonRegex() {
        return /0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\b[a-zA-Z_]\w*\b|@\w+|>=|<=|!=|==|\+=|-=|\*=|\/=|%=|\*\*|:=|->|&&|\|\||[(){}\[\];,:.*&|^~!<>=+\-/%]/g;
    }

    function classifyToken(text, lang) {
        if (/^\d/.test(text) || /^0x/i.test(text)) return COLORS.number;
        if (lang === 'c' && /^#/.test(text)) return COLORS.macro;
        if (/^[a-zA-Z_]/.test(text)) {
            if (lang === 'c') {
                if (C_TYPES.indexOf(text) >= 0) return COLORS.type;
                if (C_KEYWORDS.indexOf(text) >= 0) return COLORS.keyword;
                if (C_FUNCTIONS.indexOf(text) >= 0) return COLORS.function;
                if (C_MACROS.indexOf(text) >= 0) return COLORS.macro;
            } else {
                if (text === 'self' || text === 'cls') return COLORS.keyword;
                if (PY_KEYWORDS.indexOf(text) >= 0) return COLORS.keyword;
                if (PY_BUILTINS.indexOf(text) >= 0) return COLORS.function;
            }
            if (text === text.toUpperCase() && text.length > 1 && lang === 'c') return COLORS.type;
        }
        return COLORS.default;
    }

    // ═══════════════════════════════════════════
    //  内容解析：将消息文本拆分为 [text | code | science] 段落
    // ═══════════════════════════════════════════
    function parseContent(content) {
        if (!content) return [{ type: 'text', content: '' }];

        var segments = [];
        var regex = /```(\w*)\n?([\s\S]*?)```/g;
        var lastIdx = 0;
        var match;

        while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIdx) {
                var textBefore = content.slice(lastIdx, match.index).trim();
                if (textBefore) {
                    segments.push({ type: 'text', content: textBefore });
                }
            }

            var language = (match[1] || '').toLowerCase().trim();
            var rawCode = match[2];

            if (SCIENCE_LANGS.indexOf(language) >= 0) {
                segments.push({
                    type: 'science',
                    language: language,
                    rawCode: rawCode.trim(),
                });
            } else {
                if (!language) language = detectLanguage(rawCode);
                if (language === 'c++' || language === 'cpp') language = 'c';
                if (language === 'py') language = 'python';

                segments.push({
                    type: 'code',
                    language: language,
                    rawCode: rawCode.trim(),
                });
            }

            lastIdx = regex.lastIndex;
        }

        if (lastIdx < content.length) {
            var textAfter = content.slice(lastIdx).trim();
            if (textAfter) {
                segments.push({ type: 'text', content: textAfter });
            }
        }

        return segments;
    }

    function detectLanguage(code) {
        if (!code || !code.trim()) return '';
        var c = code.trim();
        if (/#include\b/.test(c)) return 'c';
        if (/#define\b/.test(c)) return 'c';
        if (/\bint\s+main\b/.test(c)) return 'c';
        if (/\bprintf\b/.test(c)) return 'c';
        if (/->/.test(c)) return 'c';
        if (/\bstruct\b/.test(c) || /\btypedef\b/.test(c)) return 'c';
        if (/\bdef\s+\w+\s*\(/.test(c)) return 'python';
        if (/\bimport\s+\w+/.test(c)) return 'python';
        if (/\bprint\(/.test(c)) return 'python';
        if (/\bclass\s+\w+[:(]/.test(c)) return 'python';
        if (/\bself\b/.test(c)) return 'python';
        return '';
    }

    // ═══════════════════════════════════════════
    //  HTML 渲染
    // ═══════════════════════════════════════════

    /** 渲染整段内容为 HTML（包含 text、code、science 段落） */
    function renderContent(content) {
        var segments = parseContent(content);
        var html = '';
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.type === 'text') {
                html += '<div class="msg-text">' + escapeHtml(seg.content).replace(/\n/g, '<br>') + '</div>';
            } else if (seg.type === 'code') {
                html += renderCodeBlock(seg);
            } else if (seg.type === 'science') {
                html += renderScienceBlock(seg);
            }
        }
        return html;
    }

    function renderCodeBlock(seg) {
        var lines = tokenize(seg.rawCode, seg.language);
        var langLabel = seg.language ? seg.language.toUpperCase() : 'CODE';
        var codeHtml = '';
        for (var i = 0; i < lines.length; i++) {
            codeHtml += '<span class="code-line">';
            if (lines[i].length === 0 || (lines[i].length === 1 && lines[i][0].text === '')) {
                codeHtml += ' ';
            } else {
                for (var j = 0; j < lines[i].length; j++) {
                    var t = lines[i][j];
                    codeHtml += '<span style="color:' + t.color + ';">' + escapeHtml(t.text) + '</span>';
                }
            }
            codeHtml += '</span>';
        }

        return (
            '<div class="code-block" data-folded="false">' +
                '<div class="code-block-header">' +
                    '<span class="code-lang-label">' + langLabel + '</span>' +
                    '<div class="code-block-actions">' +
                        '<button class="code-btn code-btn-fold" onclick="CodeHighlight.toggleFold(this)" title="折叠/展开">▾</button>' +
                        '<button class="code-btn code-btn-copy" onclick="CodeHighlight.copyCode(this)" title="复制代码">📋</button>' +
                    '</div>' +
                '</div>' +
                '<div class="code-block-body"><pre>' + codeHtml + '</pre></div>' +
            '</div>'
        );
    }

    function renderScienceBlock(seg) {
        var formulaHtml = '';
        var lines = seg.rawCode.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var lineTokens = parseFormulaLine(lines[i]);
            formulaHtml += '<span class="science-line">';
            for (var j = 0; j < lineTokens.length; j++) {
                var t = lineTokens[j];
                var cls = t.format === 'sub' ? 'science-sub' : t.format === 'sup' ? 'science-sup' : '';
                formulaHtml += '<span class="' + cls + '" style="color:' + t.color + ';">' + escapeHtml(t.text) + '</span>';
            }
            formulaHtml += '</span>';
        }

        return (
            '<div class="science-block">' +
                '<div class="code-block-header">' +
                    '<span class="code-lang-label">⚗ FORMULA</span>' +
                    '<div class="code-block-actions">' +
                        '<button class="code-btn code-btn-copy" onclick="CodeHighlight.copyScience(this)" title="复制公式">📋</button>' +
                    '</div>' +
                '</div>' +
                '<div class="science-block-body"><pre>' + formulaHtml + '</pre></div>' +
            '</div>'
        );
    }

    function parseFormulaLine(line) {
        var tokens = [];
        var i = 0;
        while (i < line.length) {
            if (line[i] === '^' && line[i + 1] === '{') {
                var end = line.indexOf('}', i + 2);
                if (end > i) {
                    tokens.push({ text: line.slice(i + 2, end), color: SCIENCE_COLORS.sup, format: 'sup' });
                    i = end + 1;
                    continue;
                }
            }
            if (line[i] === '_' && line[i + 1] === '{') {
                var end2 = line.indexOf('}', i + 2);
                if (end2 > i) {
                    tokens.push({ text: line.slice(i + 2, end2), color: SCIENCE_COLORS.sub, format: 'sub' });
                    i = end2 + 1;
                    continue;
                }
            }
            if (line[i] === '^' && i + 1 < line.length && line[i + 1] !== '{') {
                tokens.push({ text: line[i + 1], color: SCIENCE_COLORS.sup, format: 'sup' });
                i += 2;
                continue;
            }
            if (line[i] === '_' && i + 1 < line.length && line[i + 1] !== '{') {
                tokens.push({ text: line[i + 1], color: SCIENCE_COLORS.sub, format: 'sub' });
                i += 2;
                continue;
            }
            if ('→⇌±≈≠≤≥·∂∫ΣΠ√∝∞°′″Å'.indexOf(line[i]) >= 0) {
                tokens.push({ text: line[i], color: SCIENCE_COLORS.operator, format: 'normal' });
                i++;
                continue;
            }
            var charCode = line.charCodeAt(i);
            if ((charCode >= 0x0391 && charCode <= 0x03C9) || (charCode >= 0x1F00 && charCode <= 0x1FFF)) {
                tokens.push({ text: line[i], color: SCIENCE_COLORS.greek, format: 'normal' });
                i++;
                continue;
            }
            if (/[0-9]/.test(line[i])) {
                var numStart = i;
                while (i < line.length && /[0-9.]/.test(line[i])) i++;
                tokens.push({ text: line.slice(numStart, i), color: SCIENCE_COLORS.number, format: 'normal' });
                continue;
            }
            var normalStart = i;
            while (i < line.length &&
                   line[i] !== '^' && line[i] !== '_' &&
                   !/[0-9]/.test(line[i]) &&
                   '→⇌±≈≠≤≥·∂∫ΣΠ√∝∞°′″Å'.indexOf(line[i]) < 0 &&
                   !((line.charCodeAt(i) >= 0x0391 && line.charCodeAt(i) <= 0x03C9) ||
                     (line.charCodeAt(i) >= 0x1F00 && line.charCodeAt(i) <= 0x1FFF))) {
                i++;
            }
            if (i > normalStart) {
                tokens.push({ text: line.slice(normalStart, i), color: SCIENCE_COLORS.normal, format: 'normal' });
            }
        }
        return tokens.length > 0 ? tokens : [{ text: ' ', color: SCIENCE_COLORS.normal, format: 'normal' }];
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ═══════════════════════════════════════════
    //  交互：折叠/展开、复制
    // ═══════════════════════════════════════════
    function toggleFold(btn) {
        var block = btn.closest('.code-block');
        if (!block) return;
        var body = block.querySelector('.code-block-body');
        var isFolded = block.getAttribute('data-folded') === 'true';
        if (isFolded) {
            block.setAttribute('data-folded', 'false');
            body.style.display = '';
            btn.textContent = '▾';
        } else {
            block.setAttribute('data-folded', 'true');
            body.style.display = 'none';
            btn.textContent = '▸';
        }
    }

    function copyCode(btn) {
        var block = btn.closest('.code-block');
        if (!block) return;
        var pre = block.querySelector('pre');
        if (!pre) return;
        var text = pre.textContent;
        navigator.clipboard.writeText(text).then(function () {
            btn.textContent = '✓';
            setTimeout(function () { btn.textContent = '📋'; }, 1500);
        }).catch(function () {
            // Fallback
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = '✓';
            setTimeout(function () { btn.textContent = '📋'; }, 1500);
        });
    }

    function copyScience(btn) {
        var block = btn.closest('.science-block');
        if (!block) return;
        var pre = block.querySelector('pre');
        if (!pre) return;
        var text = pre.textContent;
        navigator.clipboard.writeText(text).then(function () {
            btn.textContent = '✓';
            setTimeout(function () { btn.textContent = '📋'; }, 1500);
        }).catch(function () {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = '✓';
            setTimeout(function () { btn.textContent = '📋'; }, 1500);
        });
    }

    return {
        parseContent: parseContent,
        renderContent: renderContent,
        tokenize: tokenize,
        detectLanguage: detectLanguage,
        toggleFold: toggleFold,
        copyCode: copyCode,
        copyScience: copyScience,
    };
})();
