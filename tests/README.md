# 自动化测试

运行冒烟测试（页面加载 / 模块 / 群聊 UI / 移动端适配）：
```bash
NODE_PATH="D:/ai/cc Programm/arknightscode/node_modules" node tests/smoke-test.cjs
```

运行端到端流程测试（mock LLM + Seedance API，验证群聊串行调度与视频状态机）：
```bash
NODE_PATH="D:/ai/cc Programm/arknightscode/node_modules" node tests/e2e-flow-test.cjs
```

> NODE_PATH 指向本机已安装 playwright 的 node_modules（按需修改）。
> 两个测试都内置静态服务器，无需手动启动页面。
