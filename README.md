# Arknights Talk with API

一个基于明日方舟（Arknights）IP 的网页聊天终端，可与罗德岛干员进行角色扮演对话。

## 在线预览

- GitHub Pages: https://fypklanfanqie.github.io/Arknights-talk-with-api-in
- Gitee Pages: https://lan-fanqie.gitee.io/Arknights-talk-with-api-in

## 功能特性

- 多角色选择：阿米娅、艾雅法拉、澄闪、泥岩、羽毛笔、逻各斯、蜜莓、遥、维什戴尔
- 角色立绘悬停切换（部分角色拥有双立绘）
- 点击角色卡播放角色语音并显示双语字幕
- 基于大语言 API 的角色扮演对话
- 本地聊天记录保存（localStorage）
- Live2D 展示（阿米娅）+ 静态立绘 fallback
- 背景音乐播放器
- 聊天区域背景图轮播
- PRTS 风格的终端 UI

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

## 项目结构

```
.
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式
├── js/
│   ├── main.js         # 应用初始化、角色切换、全局状态
│   ├── chat.js         # 聊天逻辑、LLM API 调用
│   ├── live2d.js       # Live2D 展示
│   ├── music.js        # 音乐播放器
│   ├── storage.js      # localStorage 封装
│   └── tilt.js         # 角色卡 3D 倾斜效果
├── picture/            # 角色立绘
├── music/              # 角色语音与 BGM
├── live2d/             # Live2D 模型资源
├── fonts/              # 字体文件
└── prompts/            # 角色系统提示词文档
```

## 作者

- GitHub: [@fypklanfanqie](https://github.com/fypklanfanqie)
- Gitee: [@lan-fanqie](https://gitee.com/lan-fanqie)
- 邮箱: Lfq061218@163.com
- QQ: 2859280754

## 免责声明

本项目为明日方舟同人作品，所有角色、立绘、音乐版权归 Hypergryph / 鹰角网络所有。本项目仅用于学习交流，不作商业用途。
