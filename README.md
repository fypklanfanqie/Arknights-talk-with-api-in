# Arknights Talk with API

一个基于明日方舟（Arknights）IP 的网页聊天终端，可与罗德岛干员进行角色扮演对话。

<img width="2547" height="1308" alt="image" src="https://github.com/user-attachments/assets/cb334c8e-5a22-483f-9c01-c7ea2a1a349b" />

## 在线预览

- GitHub Pages: https://fypklanfanqie.github.io/Arknights-talk-with-api-in
- Gitee Pages: https://lan-fanqie.gitee.io/Arknights-talk-with-api-in

## 功能特性

### 🤖 角色扮演对话
- **20 位罗德岛干员**：每位干员拥有独立且详尽的人格设定（身份背景、核心性格、语气特征、知识领域、经典台词），基于 LLM 大语言模型驱动
- **流式对话输出**：支持 SSE 流式响应，对话实时渲染
- **角色聊天记录独立保存**：切换角色自动加载对应历史记录（localStorage，最多保留 50 条）
- **多 API 提供商支持**：DeepSeek、OpenAI、硅基流动、阿里百炼、智谱 AI、月之暗面，以及自定义 OpenAI 兼容接口

### 🎤 TTS 语音合成
- **火山引擎豆包语音合成 2.0**：通过自建 CloudBase HTTP 函数代理调用
- **中日双语言切换**：一键切换中文/日文语音输出，日文模式自动调用 LLM 翻译
- **角色定制音色**：支持火山引擎「声音复刻」功能，为每位干员配置独立的中日文音色 ID
- **对话语音播放**：角色回复旁带播放按钮，点击即可朗读（自动过滤 Markdown/LaTeX/动作描述）

### 🎨 Live2D 动态立绘
- **阿米娅 Live2D Cubism 模型**：支持鼠标追踪 + 呼吸动画，基于 PIXI.js + pixi-live2d-display
- **全角色静态立绘回退**：无 Live2D 模型的角色自动展示高精静态立绘
- **多皮肤悬停切换**：角色卡支持双立绘/多皮肤，鼠标悬停自动切换

### 🎵 背景音乐系统
- **189 首明日方舟 OST**：覆盖 EP Y-0 至 Y-7、海外单曲、系统音乐
- **网易云音乐流媒体播放**：免下载直接串流
- **收藏夹 + 搜索 + EP 分类筛选**：快速定位曲目
- **播放器控件**：进度条拖拽、音量调节、上一首/下一首

### 💬 聊天增强
- **KaTeX 数学公式渲染**：支持行内 `$...$` 和块级 `$$...$$`，以及 `\(...\)` `\[...\]` 语法
- **代码语法高亮**：自动识别 C/Python 代码块，VS Code Dark+ 配色方案，支持折叠/展开和复制
- **物化公式渲染**：专用 ```science / ```formula 代码块，上下标、希腊字母、运算符着色
- **图片/文件上传**：支持图片（多模态模型直传，非多模态自动 OCR 提取文字）、文档（docx/xlsx/txt/csv/json 及常见代码文件）
- **聊天背景轮播**：4 张 PRTS 风格背景图定时切换

### 🎯 交互细节
- **角色卡 3D 倾斜悬停效果**：鼠标跟踪视差动画
- **点击角色卡播放语音 + 双语字幕**：日文原声 + 中文字幕同步显示
- **PRTS 风格的终端 UI**：扫描线、颗粒噪点、暗角、几何引导线入场动画
- **Loading 动画**：罗德岛风格启动画面 + 标题语音
- **移动端深度适配**：底部标签栏导航（Chat / 角色 / 音乐）、左右面板改为全屏抽屉式覆盖层（滑入/滑出动画）、聊天顶栏设置齿轮按钮 + 侧滑设置抽屉、Flex 弹性布局撑满全屏、iOS 安全区域 (safe-area-inset) 适配、触摸目标最小 44px

### 📖 内置使用指南
- 页面内置完整使用指南（点击「📖 使用指南」按钮），涵盖 API 接入、TTS 配置、使用技巧

### 📱 移动端界面优化

触屏设备（≤768px）自动启用移动端专属布局：

- **底部标签栏**：「聊天」「角色」「音乐」三个 tab 一键切换主视图，常用操作触手可及
- **抽屉式角色/音乐面板**：左右面板改为全屏固定覆盖层 (fixed overlay)，带滑入/滑出透明度动画，不挤占聊天区域
- **设置侧滑抽屉**：聊天顶栏新增齿轮按钮 ⚙️，点击从右侧滑出设置面板，无需离开聊天界面即可调整配置
- **Flex 弹性布局**：聊天区采用 `display: flex` + `100dvh` 撑满全屏，输入框吸附底部
- **iOS 安全区域**：全面适配 `safe-area-inset-*`，避开刘海/底部指示条，兼容 Safari 全屏模式
- **触摸优化**：按钮最小 44×44px 触摸目标，防止 iOS 双击缩放，`overscroll-behavior: none` 禁止橡皮筋回弹
- <img width="1080" height="2400" alt="Screenshot_2026-07-15-21-48-31-278_com microsoft" src="https://github.com/user-attachments/assets/294e965c-c885-46d3-b9f6-40c7c45ae542" />
- <img width="1080" height="2400" alt="Screenshot_2026-07-15-21-48-24-022_com microsoft" src="https://github.com/user-attachments/assets/13623a9b-ad10-4274-8bd3-132c2b9d84ea" />



## 快速开始

本项目为纯静态前端项目，无需构建。

### 本地运行

```bash
# 方式一：直接打开 index.html

# 方式二：使用本地服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

### API 配置

1. 在右侧面板选择 API 提供商，或输入自定义 API Base URL
2. 填写 API Key 与模型名称
3. 点击「保存设置」

支持的 API 格式：OpenAI 兼容的 `/chat/completions` 接口（支持流式 SSE）。

### TTS 语音合成

TTS 功能通过自建 **CloudBase 云函数 (HTTP 函数)** 代理调用火山引擎，代码位于 `workers/cloudbase-tts-fn/` 目录。

- 已部署的 TTS 代理地址：`https://lanfanqie-d8go1l51d56f44d20.service.tcloudbase.com/tts`
- 前端 `js/tts.js` 已内置该默认代理，代理地址留空即用。也可在设置面板填写自己的代理覆盖。
- 部署方式：`workers/cloudbase-tts-fn/` 目录下执行 `tcb fn deploy tts-proxy --httpFn --path /tts --force`（需 `scf_bootstrap` + 监听 9000 的 `server.js`）
- 火山引擎 API Key 获取：登录火山引擎控制台 → 语音合成 → API Key 管理
- 角色音色：前往火山引擎「声音复刻」克隆干员声音，获得 `S_xxx` 格式音色 ID，填入设置面板的角色音色映射

如需改用 Cloudflare Worker 或 CloudBase 云托管，代码分别见 `workers/tts-proxy.js` 和 `workers/cloudbase-tts-proxy/`。

## 项目结构

```
.
├── index.html                  # 主页面（含完整 UI 布局 + 使用指南弹窗）
├── css/
│   └── style.css               # 全局样式（PRTS 终端风格）
├── js/
│   ├── main.js                 # 应用初始化、角色切换、设置管理、全局状态
│   ├── chat.js                 # 聊天逻辑、LLM API 流式调用、消息渲染、KaTeX
│   ├── characters.js           # 20 位角色定义（System Prompts + 元数据）
│   ├── live2d.js               # Live2D Cubism 模型加载与交互
│   ├── music.js                # 音乐播放器（网易云串流）
│   ├── musicData.js            # 189 首曲目数据库
│   ├── tts.js                  # TTS 语音合成（火山引擎 V3 API + 代理）
│   ├── storage.js              # localStorage 封装（设置/历史/音色映射）
│   ├── ocr.js                  # 多媒体处理（图片 OCR / 多模态 / 文档提取）
│   ├── codeHighlight.js        # C/Python 语法高亮 + 物化公式渲染
│   └── tilt.js                 # 角色卡 3D 倾斜鼠标跟踪效果
├── picture/                    # 角色立绘（.png / .webp，支持多皮肤）
├── music/                      # 角色语音（.wav）+ 系统 BGM（.mp3）
├── live2d/                     # 阿米娅 Live2D Cubism 模型资源
├── fonts/                      # 字体文件（BENDER 系列）
├── prompts/                    # 角色系统提示词文档（.md）
├── lib/
│   └── live2dcubismcore.min.js # Live2D Cubism Core 本地副本
├── workers/
│   ├── tts-proxy.js            # TTS Cloudflare Worker 代理
│   ├── wrangler.toml           # Wrangler 配置
│   ├── cloudbase-tts-fn/       # TTS CloudBase 云函数代理（已部署主用）
│   │   ├── server.js           # Node.js HTTP 代理服务
│   │   ├── package.json
│   │   ├── scf_bootstrap       # CloudBase 启动脚本
│   │   └── cloudbaserc.json
│   └── cloudbase-tts-proxy/    # TTS CloudBase 云托管代理（备用）
│       ├── server.js
│       ├── package.json
│       └── Dockerfile
└── optimize_images.py          # 图片压缩优化脚本
```

## 角色列表

### 首批角色（10 位）

| 角色 | 代号 | 种族 | 定位 |
|------|------|------|------|
| 阿米娅 | Amiya | 卡特斯 / 奇美拉 | 罗德岛公开领袖 |
| 艾雅法拉 | Eyjafjalla | 卡普里尼 | 火山学家 / 天灾信使 |
| 澄闪 | Goldenglow | 菲林 | 理发师 / 驭械术师 |
| 泥岩 | Mudrock | 萨卡兹 | 雇佣兵 / 不屈者 |
| 羽毛笔 | La Pluma | 黎博利 | 近卫干员 / 调酒师 |
| 逻各斯 | Logos | 萨卡兹 / 女妖 | 精英术师 / 咒术大师 |
| 蜜莓 | Honeyberry | 札拉克 | 医疗干员 / 草药医生 |
| 遥 | Haruka | 阿戈尔 | 东国艺人 / 源石技艺助手 |
| 维什戴尔 | Wis'adel | 萨卡兹 | 雇佣兵领袖 / 巴别塔议长 |
| 左乐 | Zuo Le | 斐迪亚 | 司岁台秉烛人 |

### 扩展角色（10 位）

| 角色 | 代号 | 种族 | 定位 |
|------|------|------|------|
| 麦哲伦 | Magallan | 黎博利 | 莱茵生命外勤专员 / 极地科考员 |
| 黍 | Shu | 未公开（岁兽碎片） | 炎国农业天师 / 岁兽碎片·六 |
| 史尔特尔 | Surtr | 萨卡兹 | 近卫干员 / 罗德岛作战干员 |
| 晓歌 | Cantabile | 黎博利 | 先锋干员 / 情报官 |
| 林 | Lin | 札拉克 | 龙门合作者 / 贫民区管理者 |
| 拉普兰德 | Lappland | 鲁珀 | 近卫干员 / 领主 |
| 送葬人 | Executor | 萨科塔 | 拉特兰公证所执行者 |
| Mon3tr | Mon3tr | 未公开 | 罗德岛特别顾问 |
| 星源 | Astgenne | 黎博利 | 莱茵生命能量科研究员 |
| 德克萨斯 | Texas | 鲁珀 | 企鹅物流信使 / 先锋干员 |

## 技术栈

- **前端**：原生 HTML/CSS/JS（无框架），PIXI.js 7.4、KaTeX 0.16、mammoth.js、SheetJS
- **Live2D**：Cubism Core + pixi-live2d-display 0.4.0
- **LLM**：OpenAI 兼容 `/chat/completions` 接口（SSE 流式）
- **TTS**：火山引擎豆包语音合成 2.0 HTTP V3 API，经 CloudBase HTTP 函数代理转发
- **音频**：网易云音乐外链串流 + 本地 WAV/MP3
- **存储**：localStorage（设置 / 聊天记录 / 收藏夹 / 音色配置）

## 作者

- GitHub: [@fypklanfanqie](https://github.com/fypklanfanqie)
- Gitee: [@lan-fanqie](https://gitee.com/lan-fanqie)
- 邮箱: Lfq061218@163.com
- QQ: 2859280754

## 免责声明

本项目为明日方舟同人作品，所有角色、立绘、音乐版权归 Hypergryph / 鹰角网络所有。本项目仅用于学习交流，不作商业用途。
