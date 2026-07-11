# Arknights Talk with API

一个基于明日方舟（Arknights）IP 的网页聊天终端，可与罗德岛干员进行角色扮演对话。  
<img width="2547" height="1308" alt="image" src="https://github.com/user-attachments/assets/cb334c8e-5a22-483f-9c01-c7ea2a1a349b" />


## 在线预览

- GitHub Pages: https://fypklanfanqie.github.io/Arknights-talk-with-api-in
- Gitee Pages: https://lan-fanqie.gitee.io/Arknights-talk-with-api-in

## 功能特性

- **多角色选择**：阿米娅、艾雅法拉、澄闪、泥岩、羽毛笔、逻各斯、蜜莓、遥、维什戴尔、左乐（共 20 位干员）
- **角色立绘悬停切换**（部分角色拥有双立绘 / 多皮肤）
- **点击角色卡播放语音**并显示双语字幕
- **基于大语言 API 的角色扮演对话**（支持 OpenAI 兼容接口）
- **TTS 语音合成**：对话回复支持文字转语音播放，通过 Cloudflare Worker 代理调用
- **Live2D 动态展示**（阿米娅）+ 静态立绘 fallback
- **KaTeX 数学公式渲染**：聊天内容支持 LaTeX 数学公式
- **背景音乐播放器**：多首 BGM 可选
- **聊天区域背景图轮播**
- **角色卡 3D 倾斜悬停效果**
- **本地聊天记录保存**（localStorage）
- **移动端适配优化**
- **PRTS 风格的终端 UI**

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

支持的 API 格式：OpenAI 兼容的 `/chat/completions` 接口。

### TTS 语音合成

TTS 功能通过自建 **CloudBase 云函数 (HTTP 函数)** 代理调用火山引擎，代码位于 `workers/cloudbase-tts-fn/` 目录。

- 已部署的 TTS 代理地址：`https://lanfanqie-d8go1l51d56f44d20.service.tcloudbase.com/tts`
- 前端 `js/tts.js` 已内置该默认代理，代理地址留空即用。也可在设置面板填写自己的代理覆盖。
- 部署方式：`workers/cloudbase-tts-fn/` 目录下执行 `tcb fn deploy tts-proxy --httpFn --path /tts --force`（需 `scf_bootstrap` + 监听 9000 的 `server.js`）

如需改用 Cloudflare Worker，代码见 `workers/tts-proxy.js`。

## 项目结构

```
.
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式
├── js/
│   ├── main.js             # 应用初始化、角色切换、全局状态
│   ├── chat.js             # 聊天逻辑、LLM API 调用、KaTeX 渲染
│   ├── live2d.js           # Live2D 展示
│   ├── music.js            # 音乐播放器
│   ├── tts.js              # TTS 语音合成
│   ├── characters.js       # 角色定义（System Prompts + 元数据）
│   ├── storage.js          # localStorage 封装
│   └── tilt.js             # 角色卡 3D 倾斜效果
├── picture/                # 角色立绘
├── music/                  # 角色语音与 BGM
├── live2d/                 # Live2D 模型资源
├── fonts/                  # 字体文件
├── prompts/                # 角色系统提示词文档
└── workers/
    ├── tts-proxy.js        # TTS Cloudflare Worker 代理
    └── wrangler.toml       # Wrangler 配置
```

## 角色列表

| 角色 | 代号 | 种族 | 定位 |
|------|------|------|------|
| 阿米娅 | Amiya | 卡特斯/奇美拉 | 罗德岛公开领袖 |
| 艾雅法拉 | Eyjafjalla | 卡普里尼 | 火山学家 / 天灾信使 |
| 澄闪 | Goldenglow | 菲林 | 理发师 / 驭械术师 |
| 泥岩 | Mudrock | 萨卡兹 | 雇佣兵 / 不屈者 |
| 羽毛笔 | La Pluma | 黎博利 | 近卫干员 / 调酒师 |
| 逻各斯 | Logos | 萨卡兹 | 精英术师 / 咒术大师 |
| 蜜莓 | Honeyberry | 札拉克 | 医疗干员 / 草药医生 |
| 遥 | Haruka | 阿戈尔 | 东国艺人 / 源石技艺助手 |
| 维什戴尔 | Wis'adel | 萨卡兹 | 雇佣兵领袖 / 巴别塔议长 |
| 左乐 | Zuo Le | 斐迪亚 | 司岁台秉烛人 |

## 作者

- GitHub: [@fypklanfanqie](https://github.com/fypklanfanqie)
- Gitee: [@lan-fanqie](https://gitee.com/lan-fanqie)
- 邮箱: Lfq061218@163.com
- QQ: 2859280754

## 免责声明

本项目为明日方舟同人作品，所有角色、立绘、音乐版权归 Hypergryph / 鹰角网络所有。本项目仅用于学习交流，不作商业用途。
