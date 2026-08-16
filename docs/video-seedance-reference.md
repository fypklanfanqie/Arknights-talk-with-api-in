# Seedance「对话视频」功能移植参考（安卓 → 网页版）

> 本文档是从安卓项目（`聊天终端安卓本地`）提取的实现级技术规格，供网页版逐项移植。
> 所有字段名、请求/响应 JSON 结构、提示词模板均直接取自 Kotlin 源码（见文末源文件清单），未凭空编造。
> 「硬编码常量」小节集中列出所有带具体数值的常量及其出处。

---

## 0. 功能总览

「Seedance 对话视频」= 每次云端助手回复完成后，自动（或手动）把「角色立绘参考图 + 本次对话」提交给火山方舟 Seedance 2.0 生视频模型，生成一段演绎「角色说出这句回复」的视频，附在助手消息下方播放。

整体流水线（持久化状态机，每个任务一行，Worker 逐阶段推进）：

```
SNAPSHOT_PENDING（复制参考图快照）→ PROMPT_PENDING → PROMPTING（LLM 生成分镜 JSON）→
SUBMISSION_PENDING → SUBMITTING（POST 创建任务）→ QUEUED / RUNNING（轮询 GET）→
DOWNLOAD_PENDING → DOWNLOADING（下载）→ READY（校验 + 落盘）
```

支持两种服务端协议，按「服务地址」形态自动识别：

- **方舟协议（ARK）**：火山方舟官方 `contents/generations/tasks`；
- **中转站媒体协议（MEDIA_RELAY）**：dm1124/灵科中转站 `POST /v1/media/generate` + `GET /v1/media/status`。

---

## 1. 配置项清单

来源：`data/model/SeedanceConfig.kt`。配置经 DataStore 聚合持久化。

| 字段 | 类型 | 默认值 | 可选值 / 说明 |
|---|---|---|---|
| `baseUrl` | String | `"https://ark.cn-beijing.volces.com/api/v3"` | 方舟官方中国区基地址。用户可改：中转站填完整「创建任务」地址（如 `https://api.lk888.ai/v1/media/generate`）或裸主机（自动补 `/v1/media/generate`）。**API Key 不得硬编码，不得进日志** |
| `apiKey` | String | `""` | 方舟/中转站 API Key，必填（空则校验失败） |
| `relayModelId` | String | `"kwvideo-v2-ref"` | **仅中转站媒体协议使用**，作为 `params` 之外的顶层 `model` 字段值（dm1124/灵科 Seedance 2.0 参考生视频模型）。方舟协议不用本字段（模型由 `variant` 决定） |
| `variant` | enum `SeedanceModelVariant` | `STANDARD` | `STANDARD("doubao-seedance-2-0-260128")` / `FAST("doubao-seedance-2-0-fast-260128")`。`modelId` 直接作为方舟创建任务请求的 `model` 字段值。**模型名带日期戳（260128 = 2026-01-28）**，网页版应保留为可配置常量 |
| `resolution` | enum `SeedanceResolution` | `P720` | `P480 / P720 / P1080 / P4K`。标准模型支持全部；Fast 仅 `P480/P720`。持久化键 = 枚举名（`"P720"`） |
| `ratio` | enum `SeedanceRatio` | `PORTRAIT` | `PORTRAIT("9:16")` / `LANDSCAPE("16:9")` / `SQUARE("1:1")` / `PORTRAIT_CLASSIC("3:4")` / `LANDSCAPE_CLASSIC("4:3")` / `ULTRAWIDE("21:9")` / `ADAPTIVE("adaptive")`。`apiValue` 即请求中的 `ratio` 字段值；持久化键 = apiValue |
| `durationSeconds` | Int | `5` | 4–15 秒固定整数（两档模型一致：`minDurationSeconds=4`、`maxDurationSeconds=15`） |
| `watermark` | Boolean | `false` | 是否带水印 |
| `backgroundImagePath` | String? | `null` | 全局背景图内部路径（可选）。与通讯聊天背景（多张轮播）不同，这是**一张全局图**，存 `filesDir/seedance_scene/background.{ext}` |
| `sceneDescription` | String | `""` | 场景描述文字（可选，进提示词 user 消息） |
| `generateAudio` | Boolean | `true`（固定） | Seedance 2.0 生成音频不可关闭，**不可配置**，恒为 true |

未知/空持久化值一律保守回落默认档位（`fromStorageKey`），绝不崩溃、绝不误触发。

---

## 2. 方舟协议（ARK）

来源：`data/remote/SeedanceClient.kt` + `data/remote/SeedanceDtos.kt`。

### 2.1 端点与鉴权

| 操作 | 方法 | 路径 |
|---|---|---|
| 创建任务 | `POST` | `{baseUrl}/contents/generations/tasks` |
| 查询状态/结果 | `GET` | `{baseUrl}/contents/generations/tasks/{id}` |
| 取消排队任务 | `DELETE` | `{baseUrl}/contents/generations/tasks/{id}`（仅 `queued` 可取消；succeeded/failed/expired 为删除记录；成功无响应体） |

- 请求头：`Authorization: Bearer {apiKey}`、`Content-Type: application/json`。
- 请求体序列化 `Json { ignoreUnknownKeys=true; explicitNulls=false; isLenient=true }` → **null 字段被省略**，content 项里不会出现 null 字段。
- 用户填的「服务地址」归一化 `resolveSeedanceTaskCollectionEndpoint`：
  - 仅主机 / `/api` / `/vN` / `/api/vN`（正则 `^/v\d+$`、`^/api/v\d+$`）→ 自动拼接 `/contents/generations/tasks`；
  - 带具体资源路径 → 原样作为创建任务地址（防 404）；
  - 已以 `/contents/generations/tasks` 结尾 → 原样（防双拼）。
- request-id 从响应头捕获（候选：`X-Request-Id` / `Request-Id` / `X-Tt-Logid` / `x-trace-id`），不参与逻辑，仅排查用。

### 2.2 创建任务请求 JSON（完整结构）

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "<finalPrompt 全文>"
    },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": {
        "url": "data:image/png;base64,<base64 正文，无 data: 前缀>"
      }
    },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": {
        "url": "data:image/png;base64,<背景图 base64>"
      }
    }
  ],
  "resolution": "720p",
  "ratio": "9:16",
  "duration": 5,
  "generate_audio": true,
  "watermark": false
}
```

要点（`CreateSeedanceTaskRequest` / `SeedanceContentPart` / `SeedanceImageUrl` DTO）：

- `content` 数组固定顺序：**第 1 项 text（finalPrompt），第 2 项 image_url（角色立绘，`role="reference_image"`），第 3 项 image_url（背景，`role="reference_image"`，可选）**。背景存在时才有第 3 项。
- 图片以 **data URL** 内联：`"data:{mime};base64,{base64NoPrefix}"`（`mime` 如 `image/png`，不含 `data:` 前缀）。
- 分辨率字段值：`"480p" / "720p" / "1080p" / "4k"` —— **注意方舟协议 4K 是小写 k**（中转站协议是 `"4K"` 大写）。
- `generate_audio` 恒为 `true`。请求体不含 fps/seed/camera 字段。
- 创建成功即视为进入排队：客户端不额外发请求，直接进入轮询阶段。

### 2.3 轮询响应 JSON（GET 查询 / POST 创建 / DELETE 取消共用结构）

```json
{
  "id": "task-xxxxxxxx",
  "status": "queued",
  "output": {
    "video_url": "https://...（签名 URL）",
    "last_frame_url": "https://..."
  },
  "error": {
    "code": "...",
    "message": "..."
  },
  "usage": {},
  "created_at": 1730000000,
  "updated_at": 1730000000
}
```

- 所有字段可空：服务端可能省略任意字段；未知字段忽略，字段缺失不崩溃。
- `status` 官方取值（`SeedanceRemoteStatus`）：`queued` / `running` / `cancelled` / `succeeded` / `failed` / `expired`。未知值保守回落 `FAILED`（绝不误判为成功）。
- `output.video_url` 为签名 URL，**约 24 小时失效**（见 §7）。
- `error.code/message` 为结构化错误体；`usage` 保留原样（JsonElement，不解析）。
- DELETE 成功返回空体时，客户端**合成** `{id: taskId, status: "cancelled"}`。

### 2.4 错误码 / 错误响应结构与分类

错误体解析 `parseErrorBody`：兼容 `{code, msg}` 与 `{error:{code,message}}` 两种形态，非 JSON 回落 null。

分类函数 `classifySeedanceError(httpStatus, remoteCode, remoteMessage)`，优先级从高到低：

| 判定条件 | 分类 | 用户文案（硬编码） |
|---|---|---|
| HTTP 401 / 403 | `AUTH` | Seedance API Key 无效或未授权 |
| HTTP 429 / ≥500 | `TRANSIENT_429_5XX` | 视频服务暂时繁忙（HTTP n），请稍后重试 |
| 404/405 且错误体含 `modelnotopen`/`not activated`/`activate the model`（小写匹配） | `MODEL_NOT_OPEN` | 模型未开通（HTTP n）：请在火山方舟控制台开通该模型服务后重试 |
| 404/405 且有结构化错误体（code/message 非空） | `NOT_FOUND` | 模型或任务不存在（HTTP n）：请检查模型 ID 是否可用，以及 API Key 与所选区域是否匹配（火山方舟 / BytePlus / 中转站） |
| 404/405 且空体/HTML（网关或路由层 404） | `BAD_ENDPOINT` | 服务地址或路径可能不正确（HTTP n）：官方 base 会自动补 /contents/generations/tasks；中转站请粘贴完整的「创建任务」接口地址（如 https://api.lk888.ai/v1/media/generate） |
| 错误体含敏感标记：`sensitive, contentreview, content_review, 审核, 敏感, 违规, moderation, unsafe, policy, violate, inappropriate` | `SENSITIVE_CONTENT` | 视频生成内容未通过审核，请修改角色或场景描述后重试 |
| 错误体含配额标记：`quota, exceed, insufficient, 余额, 额度, 配额, 欠费, balance, limit, 限额` | `QUOTA_EXCEEDED` | 额度不足或已达上限，请稍后重试 |
| 错误体含鉴权标记：`unauthorized, unauthenticated, auth, apikey, api key, invalid key, credential, 签名, 鉴权, 凭证, 权限` | `AUTH` | （同上） |
| HTTP 400/422 或错误体含参数标记：`invalid, parameter, param, 参数, 不合法, bad request, bad_request, validation` | `INVALID_PARAMETER` | 请求参数不合法，请调整生成设置 |
| 其余 | `OTHER` | 视频生成失败（HTTP n） |

- **429/5xx 优先判瞬时**（即使消息含 quota 字样也不误判为配额）。
- 网络层 IOException（连接超时 / DNS 失败 / 连接拒绝 / TLS 问题 / 其他）→ `AMBIGUOUS_TRANSPORT`，文案「网络错误，无法确认任务状态」。**此类失败绝不自动重发**（POST 可能已到服务端，自动重发会重复计费）。
- `Retry-After` 响应头（秒→毫秒）被捕获，供退避策略优先采用。
- 异常 `SeedanceApiException` 携带 `classification / httpStatus / remoteCode / requestId / taskId / retryAfterMillis`；`message` 为用户可读中文，**绝不包含 API Key、base64、签名 URL**。

### 2.5 协议识别（URL 形态判定）

`seedanceProtocolFor(baseUrl)`：

1. 路径含 `/media/generate` → `MEDIA_RELAY`；
2. 已知中转站主机（`api.lk888.ai` / `api.lingkeai.ai` / `dm1124.com` / `lingkeai.vip` / `www.lingkeai.vip`）且路径为空或 `/v1` → `MEDIA_RELAY`；
3. 其余（官方 base、任意完整资源路径）→ `ARK`。

---

## 3. 中转站媒体协议（MEDIA_RELAY）

### 3.1 创建任务：`POST {baseUrl}/v1/media/generate`

地址归一化 `resolveMediaGenerateEndpoint`：已含 `/media/generate` 原样用；裸主机或 `/v1` 自动补 `/v1/media/generate`；其他带路径地址原样用。

请求 JSON（`MediaGenerateRequest`，固定三字段）：

```json
{
  "model": "kwvideo-v2-ref",
  "prompt": "<finalPrompt 全文>",
  "params": {
    "images": [
      "data:image/png;base64,<角色图>",
      "data:image/png;base64,<背景图>"
    ],
    "version": "标准",
    "duration": "5",
    "aspect_ratio": "9:16",
    "resolution": "720p"
  }
}
```

`params`（`MediaGenerateParams`）逐字段：

| 字段 | 说明 |
|---|---|
| `images` | 参考图片 data URL 列表。kwvideo-v2-ref：**1~9 张，必填**。角色图在前、背景图在后 |
| `version` | 速度版本，kwvideo-v2-ref：`Mini / 快速 / 标准`，必填。**客户端映射：STANDARD→`"标准"`、FAST→`"快速"`** |
| `duration` | **字符串**：`auto` 或 `4~15`，必填。客户端传 `durationSeconds.toString()`（如 `"5"`） |
| `aspect_ratio` | 可选：`adaptive / 9:16 / 16:9 / 1:1 / 3:4 / 4:3 / 21:9`（= `ratio.apiValue`） |
| `resolution` | 可选：`480p / 720p / 1080p / 4K`。**注意 4K 为大写 K**（与方舟协议的 `"4k"` 不同） |

空字段省略（explicitNulls=false）。`model` 取 `config.relayModelId`，空则回落硬编码 `DEFAULT_RELAY_MODEL_ID = "kwvideo-v2-ref"`。

### 3.2 创建响应：`{code, msg, data:{task_id}}` 包装

```json
{ "code": 200, "msg": "ok", "data": { "task_id": "123456" } }
```

- `code` 可能为数字或字符串；`task_id` 兼容数字/字符串两种 JSON 类型，也兼容**无包装直接平铺顶层 `task_id`** 的渠道。
- 错误文案取 `msg` 优先，回落 `message`。
- **业务码判定**：HTTP 2xx 但包装 `code != 200` → 明确业务失败（余额不足/参数错误等），`429` 判 `TRANSIENT_429_5XX`，其余按消息标记词分类；**绝不重发**（协调器只影响文案）。
- HTTP 2xx 但未返回任务 ID → 返回空响应，由协调器按**歧义**处理（可能已产生费用）。
- 创建成功即合成 `status="queued"` 驱动轮询。

### 3.3 状态查询：`GET {statusEndpoint}?task_id={id}`

`resolveMediaStatusEndpoint`：把创建地址中的 `/media/generate` 替换为 `/media/status`。

响应 JSON（`MediaTaskStatus`）：

```json
{
  "task_id": "123456",
  "state": "success",
  "is_final": true,
  "progress": "100%",
  "result_url": "https://...",
  "result_type": "video",
  "error": null,
  "status": "已完成",
  "status_group": "success"
}
```

判定规则（文档原文）：**终态用 `is_final === true`；成功/失败用 `state`（pending / running / success / failed）；`status` / `status_group` 是中文展示字段，不参与逻辑判定。**

映射为方舟形状 `SeedanceTaskResponse`（`mapMediaStatusToTaskResponse`，保守、绝不错判）：

| state | is_final | 映射 |
|---|---|---|
| `success` 且 `result_url` 非空 | — | `SUCCEEDED`（可下载，output.video_url=result_url） |
| `success` 但 URL 未就绪 | — | `RUNNING`（继续轮询，避免「成功无产物」分支） |
| `failed` | — | `FAILED`（error.code=`"REMOTE_FAILED"`，message=error 文案） |
| `pending` | — | `QUEUED` |
| `running` | — | `RUNNING` |
| 未知状态 | `true` | 保守 `FAILED` |
| 未知状态 | `false`/缺省 | `RUNNING`（继续轮询） |

- 状态响应也兼容 `{data:{...}}` 包裹（无任务字段时按错误包装分类抛出，`OTHER` 回落 `NOT_FOUND`）。
- **取消端点未提供**：`cancelQueuedTask` 抛 `UnsupportedOperationException`，协调器兜底转为继续轮询（以服务端状态为准）。
- 单张参考图（base64 解码后）大小上限 **10MB**（`MEDIA_REFERENCE_MAX_BYTES`，对齐中转站文档）。

### 3.4 与方舟协议的差异（速查）

| 维度 | 方舟 ARK | 中转站 MEDIA_RELAY |
|---|---|---|
| 创建端点 | `POST {base}/contents/generations/tasks` | `POST {base}/v1/media/generate` |
| 查询端点 | `GET .../tasks/{id}` | `GET .../v1/media/status?task_id={id}` |
| 取消 | `DELETE .../tasks/{id}`（仅 queued） | 不支持，兜底轮询 |
| model 字段 | `variant.modelId`（doubao-seedance-2-0-*） | `relayModelId`（默认 kwvideo-v2-ref） |
| 图片传法 | content 数组 `image_url` 项 + `role="reference_image"` | `params.images` 数组（data URL） |
| 版本参数 | 无（模型名区分） | `params.version`：`"标准"` / `"快速"` |
| 时长参数 | `duration`：Int 秒 | `params.duration`：**字符串**（"auto" 或 "4~15"） |
| 画幅 | `ratio` 字段 | `params.aspect_ratio` 字段 |
| 4K 拼写 | `"4k"`（小写） | `"4K"`（大写） |
| 响应包装 | 任务对象直接返回 | `{code, msg, data:{task_id}}` + `{state, is_final, result_url}` |
| 图片大小上限 | 30MB | 10MB（单张） |

---

## 4. 分镜提示词

来源：`video/SeedancePromptGenerator.kt`。

### 4.1 调用流程

一次 LLM 调用（走**对话 LLM 配置**，即 `ApiConfig{baseUrl, apiKey, model}`，不是 Seedance 配置）→ `chatOnceStructured`（jsonMode=true）→ 严格解析 JSON：

1. `MarkdownParser.stripThink(raw)` 剥离 `<think>`；
2. `extractJsonCandidate`：去 ```` ```json ```` 围栏（或任意 ```` ``` ```` 围栏）→ 截取**首个 `{` 到最后一个 `}`**（仅做必然安全的引导语裁剪）；
3. `Json{ignoreUnknownKeys=true, isLenient=true}` 反序列化为 `SeedancePromptDocument`；
4. 质量门禁：`subject`/`action`/`environment` 全空 → 抛异常；分镜描述合计（8 个字段去空白、按顺序 `；` 拼接）**< 100 字（`MIN_DESCRIPTION_LENGTH`）→ 抛异常**；
5. `technical` 与 `finalPrompt` 由生成器**确定性覆盖**。

任何解析失败抛 `SeedancePromptParseException`，**绝不重试、绝不二次调用、绝不拼凑伪造 JSON**，任务转 `FAILED_PROMPT` 等用户。

### 4.2 导演 system prompt（Kotlin 原文逐字照抄）

```text
你是资深 Seedance 视频分镜导演。根据角色设定、前情对话与本次对话，生成一段可直接用于视频生成的详细中文分镜提示词。

硬性要求：
1. 本次视频必须直接演绎「角色回复」这句话：画面就是角色正在说出这句话的瞬间——动作、手势、神态、口型与情绪都要与这句话的内容逐句对应；回复中提到的事物、场景、事件必须真实出现在画面里（例如回复提到“下雨”，画面就要下雨；提到“递来一杯茶”，就要有递茶的动作）。禁止编造与本次对话无关的剧情。
2. 全片只有一个可见角色，即当前角色本人；不得出现第二人、路人或其他人物（仅允许环境中的非人物元素）。角色外貌、服装、发型、配饰在全片保持完全一致（身份与服饰连续性），并且必须与参考人设图（第 1 张参考图 = 角色形象图）完全一致。
3. 外貌与服装必须写足细节：从「角色设定」中提炼发色、发型、瞳色、服装款式与颜色、配饰、体型、气质等，写成至少 60 字的完整描述填入 appearance 字段；设定未提及的细节可合理补全，但不得与设定矛盾，也不得因此引入第二个人。
4. 环境（environment）按参考图角色映射确定：若提供了第 2 张参考图（背景场景图），必须严格以它为准，地点/时间/天气/氛围与之完全一致，不得凭空改换；没有第 2 张参考图时，优先严格采用「场景补充」（文字），仍无则根据对话内容推断具体地点/时间/天气/氛围。
5. 动作要有电影感与连贯运动感（cinematic motion），写成完整连贯的运动过程并按需分阶段描述（是否分阶段、分几阶段遵循第 9 条「时长适配」）；镜头语言明确（景别、运动方向）；光影与色调具体。
6. 视频必须包含原生声音与音效（native audio）：环境音、动作音效，以及角色说话时的语气与口型状态；音频描述需与画面动作一致。
7. 严格只输出一个 JSON 对象，不要输出任何解释或多余文字，不要输出思考过程。
8. 参考图角色映射（重要）：本次生成会按顺序附带参考图——第 1 张参考图固定为角色形象图（人物外貌/服装/发型/配饰的唯一依据），第 2 张参考图（若有）固定为背景场景图（环境/地点/时间/天气/氛围的唯一依据）。appearance 必须与第 1 张参考图一致，environment 必须与第 2 张参考图一致，绝不混淆两张图的用途。
9. 时长适配（重要）：动作、镜头与音效的编排数量必须与视频总时长严格匹配，视频越短越精简。具体秒数与该时长下的编排要求见用户消息「视频时长」小节：4-5 秒短片只能是单个连续瞬间，不得分多阶段展开；10-15 秒长片才可写成完整多阶段运动。禁止在短时长视频中堆砌多个动作阶段或多个场景。

JSON 字段（均为字符串，使用中文）：
- subject：画面主体（只能是当前这一个角色）
- appearance：角色外貌与服装的详细描述（至少 60 字）
- action：角色的动作与运动全过程（分阶段，如开场→发展→收尾）
- environment：环境与场景（具体到地点/时间/天气/氛围）
- camera：镜头与运镜（含景别与运动方向）
- lighting：光线与色调
- audio：原生声音、音效与角色说话状态
- continuity：身份与服饰连续性说明
- technical：技术参数（版本/分辨率/画幅/时长/音频，留空即可，由系统补全）
- finalPrompt：整合以上所有要素的最终成片提示词（留空即可，由系统补全）

质量红线：
- 除 technical 与 finalPrompt 外，每个字段必须写具体、写满（30 字以上，appearance 至少 60 字）；禁止空洞形容词（如“美丽”“好看”“帅气”）与短语拼接；
- finalPrompt 与 technical 可以留空，其余字段不得为空。
```

（Kotlin 常量 `SYSTEM_PROMPT` 为原始字符串，无 trimIndent；每行无前导空格。）

### 4.3 user 消息结构（`buildUserMessage`，拼接模板逐字）

单条纯文本 user 消息，**绝不携带图片或 base64**。`{...}` 为插值：

```text
【角色信息】
角色名称：{characterName}
角色身份：{characterRole}
角色设定：{characterSystemPrompt.trim().take(800)}
【若有前情对话，此处插入：】
<空行>
【前情对话】（用于理解本次对话的来龙去脉，视频只演绎「本次对话」）
{recentContext.trim().take(1500)}
<空行>
<空行>
【本次对话】（视频要演绎的就是下面这条「角色回复」）
用户发言：{userText.trim().take(500)}
角色回复：{assistantText.trim().take(1000)}
<空行>
【参考图】（生成视频时会按顺序附带，请据此理解画面）
第 1 张参考图 = 角色形象图：角色的外貌、服装、发型、配饰必须以它为准，appearance 与它完全一致。
【若有背景参考图，追加：】
第 2 张参考图 = 背景场景图：environment 必须以它为准，画面背景、地点、时间、天气、氛围与它一致，不得凭空改换。
【若有场景描述文字，追加（有背景图时用前者，无背景图时用后者）：】
场景补充（文字，仅作环境细节参考，不得与背景参考图冲突）：{sceneDescription.trim().take(300)}
场景补充（文字，environment 以此为依据）：{sceneDescription.trim().take(300)}
<空行>
【视频时长】（动作、镜头与音效的编排数量必须与总时长严格匹配）
本次视频总时长为 {durationSeconds} 秒。{durationGuidance}
<空行>
请生成结构化视频提示词 JSON。
```

（注：`appendLine()` 结尾自带换行，实际段落之间有空行。截断上限：角色设定 800 字、前情 1500 字、用户发言 500 字、角色回复 1000 字、场景描述 300 字，均 `trim()` 后截取。）

**前情对话来源**（`AppContainer.buildSeedanceConversationContext`）：取该会话最近消息，剔除与本次用户发言/角色回复内容相同的两条（当前轮），取最多 **8 条**（`MAX_PROMPT_CONTEXT_TURNS`）按时间正序拼接；单条截断 200 字，格式：

```text
用户：{content.take(200)}
角色：{content.take(200)}
```

提供者任何异常**静默降级为空串**，绝不阻塞视频流水线。

**时长指引**（`durationGuidance`，Kotlin 原文）：

| 时长 | 指引 |
|---|---|
| ≤5 秒 | 4-5 秒的短片只能是一个连贯瞬间：动作写成单个连续动作（可含一句台词与伴随的小动作），不允许分多阶段展开、不允许出现多个场景或多次转场；镜头一镜到底或仅一次轻微运镜；音效只保留与当前动作直接相关的一两样。 |
| ≤9 秒 | 6-9 秒的中短片是一个完整动作过程：最多两个自然阶段（开场到收尾），镜头允许一次景别变化，运镜简洁。 |
| 其他（10-15 秒） | 10-15 秒的长片可以写成完整的两到三阶段运动（开场、发展、收尾），允许更丰富的运镜层次与音效编排。 |

### 4.4 输出 JSON schema（`SeedancePromptDocument` 全字段）

全字符串字段，前 8 项来自 LLM 结构化输出，后 2 项由生成器确定性覆盖：

```json
{
  "subject": "画面主体（只能是当前这一个角色）",
  "appearance": "角色外貌与服装的详细描述（至少 60 字）",
  "action": "角色的动作与运动全过程（分阶段，如开场→发展→收尾）",
  "environment": "环境与场景（具体到地点/时间/天气/氛围）",
  "camera": "镜头与运镜（含景别与运动方向）",
  "lighting": "光线与色调",
  "audio": "原生声音、音效与角色说话状态",
  "continuity": "身份与服饰连续性说明",
  "technical": "（系统覆盖，见下）",
  "finalPrompt": "（系统覆盖，见下）"
}
```

`SeedancePromptDocument` 也用于持久化 `promptJson`（`Json{encodeDefaults=true}` 编码后落库）。

### 4.5 buildFinalPrompt 拼装模板（逐字）

```text
technical（确定性生成，逐字）：
版本：{variantLabel}；分辨率：{resolutionLabel}；画幅：{ratio.apiValue}；时长：{durationSeconds}秒；音频：开启

  variantLabel：STANDARD→"标准版"，FAST→"快速版"
  resolutionLabel：P480→"480p"，P720→"720p"，P1080→"1080p"，P4K→"4K"

description = [subject, appearance, action, environment, camera, lighting, audio, continuity]
             .filter(非空白).joinToString("；")

referenceDirective（参考图角色映射，直接写入最终提示词，与请求体图片顺序一致）：
  有背景参考图："角色形象以第 1 张参考图为准，背景场景以第 2 张参考图为准"
  无背景参考图："角色形象以参考图为准"

finalPrompt = [referenceDirective, description, technical]
              .filter(非空白).joinToString("。")
```

示例（假想）：`角色形象以第 1 张参考图为准，背景场景以第 2 张参考图为准。subject…；appearance…。版本：标准版；分辨率：720p；画幅：9:16；时长：5秒；音频：开启`

---

## 5. 状态机

来源：`data/model/SeedanceVideo.kt`（状态枚举）+ `video/SeedancePipelineCoordinator.kt`（流转）+ `video/SeedanceRequestValidator.kt`（canTransition）+ `video/SeedanceRetryPolicy.kt`（退避）。

### 5.1 状态枚举（20 个，持久化 storageKey）

| 状态 | storageKey | 含义 |
|---|---|---|
| `SNAPSHOT_PENDING` | `snapshot_pending` | 待复制角色图/背景图快照（outbox 落库初始态） |
| `PROMPT_PENDING` | `prompt_pending` | 待生成视频提示词 |
| `PROMPTING` | `prompting` | 提示词生成中（进行中，由认领的 Worker 独占） |
| `SUBMISSION_PENDING` | `submission_pending` | 待提交远端创建任务 |
| `SUBMITTING` | `submitting` | 提交中（进行中） |
| `QUEUED` | `queued` | 远端排队中 |
| `RUNNING` | `running` | 远端生成中 |
| `CANCEL_REQUESTED` | `cancel_requested` | 已请求取消（仅 QUEUED 可发起，结果以服务端状态为准） |
| `DOWNLOAD_PENDING` | `download_pending` | 待下载成品视频 |
| `DOWNLOADING` | `downloading` | 下载中（进行中） |
| `READY` | `ready` | 终态：已下载校验并归档，可播放 |
| `CANCELLED` | `cancelled` | 终态：远端任务已取消 |
| `EXPIRED` | `expired` | 远端任务过期（需用户确认后重新提交） |
| `FAILED_SNAPSHOT` | `failed_snapshot` | 快照复制失败（修复角色图后可手动重试） |
| `FAILED_PROMPT` | `failed_prompt` | 提示词生成失败 |
| `FAILED_PROMPT_CONFIG_CHANGED` | `failed_prompt_config_changed` | 当前模型/基地址配置与任务快照不一致，拒绝静默换模型 |
| `FAILED_SUBMISSION` | `failed_submission` | 提交失败或结果不确定（AMBIGUOUS_POST），**绝不自动重发** |
| `FAILED_REMOTE` | `failed_remote` | 远端模型生成失败 |
| `FAILED_QUERY` | `failed_query` | 查询远端状态失败 |
| `FAILED_DOWNLOAD` | `failed_download` | 下载失败 |

（任务描述说「14 状态」——实际源码为 **20 状态**，本表以源码为准。）

- 未知/空持久化值保守回落 `FAILED_SUBMISSION`：不冒充 READY 播放未校验文件、不被 Worker 自动认领。
- 领域模型 `SeedanceVideo` 全部字段见源文件（id、taskUuid、triggerType、各快照、参考图路径+哈希、生成参数快照、状态与远端字段、本地产物、重试字段、时间戳）。`taskUuid` = 任务目录名 `filesDir/seedance/tasks/{taskUuid}`，落库时生成一次永不改变；自动任务格式 `"auto-{userMessageId}-{millis}"`。

### 5.2 合法转换表（canTransition）

```
SNAPSHOT_PENDING      → PROMPT_PENDING | FAILED_SNAPSHOT
PROMPT_PENDING        → PROMPTING | FAILED_PROMPT_CONFIG_CHANGED
PROMPTING             → SUBMISSION_PENDING | PROMPT_PENDING(中断恢复) | FAILED_PROMPT | FAILED_PROMPT_CONFIG_CHANGED
SUBMISSION_PENDING    → SUBMITTING
SUBMITTING            → QUEUED | RUNNING | DOWNLOAD_PENDING | FAILED_SUBMISSION(AMBIGUOUS_POST) | FAILED_REMOTE(创建即失败)
QUEUED                → RUNNING | CANCEL_REQUESTED | DOWNLOAD_PENDING | FAILED_REMOTE | FAILED_QUERY | EXPIRED
RUNNING               → DOWNLOAD_PENDING | FAILED_REMOTE | FAILED_QUERY | EXPIRED
CANCEL_REQUESTED      → CANCELLED | RUNNING | DOWNLOAD_PENDING | FAILED_QUERY   （竞态以服务端状态为准）
DOWNLOAD_PENDING      → DOWNLOADING | EXPIRED
DOWNLOADING           → READY | FAILED_DOWNLOAD | EXPIRED | DOWNLOAD_PENDING(中断恢复)
READY, CANCELLED      → （终态，不允许迁出）
EXPIRED               → SUBMISSION_PENDING
FAILED_SNAPSHOT       → SNAPSHOT_PENDING
FAILED_PROMPT         → PROMPT_PENDING
FAILED_PROMPT_CONFIG_CHANGED → PROMPT_PENDING
FAILED_SUBMISSION     → SUBMISSION_PENDING
FAILED_REMOTE         → SUBMISSION_PENDING
FAILED_QUERY          → QUEUED | RUNNING | DOWNLOAD_PENDING   （继续查询复用同一 remoteTaskId）
FAILED_DOWNLOAD       → DOWNLOAD_PENDING | EXPIRED            （继续下载不重新生成；URL 失效先 GET 刷新）
```

### 5.3 每阶段动作 / 超时 / 重试

**并发原语**：`claim(id, from, to)` = `UPDATE ... SET state=:to WHERE id=:id AND state=:from`（CAS，受影响行数 0 = 已被其他 Worker 抢占）。进行中状态（PROMPTING/SUBMITTING/DOWNLOADING）由认领的「拥有者 Worker」独占推进，并发 Worker 碰到不做任何事。

**SNAPSHOT_PENDING**：解析 outbox 来源快照 → 复制参考图到任务目录（规则见 §6）→ 幂等写回路径/MIME/SHA-256 字段 → CAS 到 PROMPT_PENDING。失败 → `FAILED_SNAPSHOT`（错误码 `CHARACTER_MISSING` / `SNAPSHOT_FAILED`）。

**PROMPT_PENDING**：CAS 到 PROMPTING → **配置变更门禁**：当前 `ApiConfig.baseUrl/model` ≠ 任务快照 `promptBaseUrlSnapshot/promptModelSnapshot` → `FAILED_PROMPT_CONFIG_CHANGED`（`CONFIG_CHANGED`，「模型/服务地址已变更，请确认后重试」）；apiKey 空白 → `FAILED_PROMPT`（`MISSING_API_KEY`）。调 LLM：解析失败 → `FAILED_PROMPT`（`PROMPT_PARSE`）；瞬时异常 → 有界退避回 PROMPT_PENDING（`PROMPT_TRANSIENT`），耗尽转 `FAILED_PROMPT`。成功 → 写 `promptJson` + `finalPrompt` → SUBMISSION_PENDING。

**SUBMISSION_PENDING**：CAS 到 SUBMITTING → 持久化 `submissionAttemptId / submissionStartedAt / requestFingerprint`（指纹 = SHA-256 小写十六进制，原料：`finalPrompt|variant|resolution|ratio|duration|watermark|characterSha|backgroundSha` 以 `|` 连接）→ 校验（§6）→ 编码参考图 → POST。
- **SUBMITTING 残留判定**：启动恢复时 `startedAt == null || now - startedAt > 5min`（`SUBMISSION_STALE_THRESHOLD_MS`）→ 按歧义复位 `FAILED_SUBMISSION` + `AMBIGUOUS_POST` + `requiresCostConfirmation=true`。
- **失败策略（绝不自动重发 POST）**：
  - `AMBIGUOUS_TRANSPORT` → `FAILED_SUBMISSION` / `AMBIGUOUS_POST` / `requiresCostConfirmation=true` / `retryDisposition="ambiguous_post"`；
  - 明确 4xx（含 429）→ `FAILED_SUBMISSION` / 分类错误码 / `requiresCostConfirmation=false`；
  - 5xx（502/504 网关可能在服务端已建任务后才返回）→ `FAILED_SUBMISSION` / `requiresCostConfirmation=true`；
  - 成功但无任务 ID → `FAILED_SUBMISSION` / `AMBIGUOUS_POST` / `requiresCostConfirmation=true`（「服务端未返回任务 ID，请确认是否已产生费用」）；
  - 参考图编码失败 → `FAILED_SUBMISSION` / `SNAPSHOT_ENCODE_FAILED`（「参考图缺失或不可读」，stage=SNAPSHOT）。
- 成功 → 依据响应状态进入 QUEUED/RUNNING/DOWNLOAD_PENDING/FAILED_REMOTE。

**QUEUED/RUNNING/CANCEL_REQUESTED（轮询）**：
- CANCEL_REQUESTED 时先再调一次 cancel（异常忽略，GET 兜底）；
- `GET` 失败 → `SeedanceRetryPolicy.retryDelayMillis` 有界退避（见下），耗尽 → `FAILED_QUERY` / `retryDisposition="manual"`；
- 远端状态迁移：QUEUED→（轮询）；RUNNING→（轮询）；**SUCCEEDED**：有 `video_url` → 记 `remoteVideoUrl/remoteVideoUrlObservedAt/remoteVideoUrlExpiresAt(=now+24h)` → DOWNLOAD_PENDING；SUCCEEDED 但 URL 空 → 回落 QUEUED 继续轮询；**CANCELLED** → CANCELLED（终态）；**FAILED** → FAILED_REMOTE（`REMOTE_FAILED`，远端 message 经净化：去 URL/`data:` 内联、压缩空白、截断 200 字，净化后为空回落「远端视频生成失败」）；**EXPIRED** → EXPIRED（`EXPIRED`，「远端视频任务已过期」）。
- **轮询间隔**：10 秒（`POLL_INTERVAL_MILLIS`）。

**DOWNLOAD_PENDING**：URL 空 → 回落 QUEUED 继续轮询；`expiresAt` 已到 → EXPIRED（`URL_EXPIRED`，「视频下载地址已过期，请重新生成」，需用户确认重新提交）；已有成品且 SHA-256 匹配 → 幂等 READY；否则 CAS 到 DOWNLOADING → 下载（失败 → `DOWNLOAD_TRANSIENT` 有界退避回 DOWNLOAD_PENDING，耗尽 → `FAILED_DOWNLOAD`）→ 保存校验（§7）→ READY。

**READY/CANCELLED**：终态，Worker 不再调度。

**退避策略**（`SeedanceRetryPolicy`，0 基计数 `automaticRetryCount` 持久化）：

| 常量 | 值 | 说明 |
|---|---|---|
| `DEFAULT_MAX_AUTOMATIC_RETRIES` | 5 | 达到上限返回 null → 转永久失败态 |
| `DEFAULT_BASE_BACKOFF_MILLIS` | 15_000 ms | 指数退避基数：`base * 2^attempt` |
| `DEFAULT_MAX_BACKOFF_MILLIS` | 5 min | 退避封顶 |
| `MAX_RETRY_AFTER_MILLIS` | 10 min | 服务端 Retry-After 最长采纳 10 分钟（优先于本地退避） |
| `POLL_INTERVAL_MILLIS` | 10_000 ms | 排队/生成中轮询间隔 |

**手动重试映射**（`retryEntryStateOf` + `prepareRetry`）：`FAILED_SNAPSHOT→SNAPSHOT_PENDING`；`FAILED_PROMPT/CONFIG_CHANGED→PROMPT_PENDING`；`FAILED_SUBMISSION/FAILED_REMOTE/EXPIRED→SUBMISSION_PENDING`；`FAILED_QUERY→QUEUED`（继续查询）；`FAILED_DOWNLOAD→DOWNLOAD_PENDING`。仅入口为 SUBMISSION_PENDING（重新生成语义）时归档当前 `remoteTaskId` 进 `previousRemoteTasksJson`（JSON 数组原文）并 `generationAttempt += 1`；所有手动重试无条件重置 `automaticRetryCount=0`、`requiresCostConfirmation=false`（用户已确认才走到手动重试）。

**错误字段**：`errorStage` ∈ {SNAPSHOT, PROMPT, SUBMIT, REMOTE, QUERY, DOWNLOAD}（硬编码）；`retryDisposition` ∈ {manual, bounded_retry, ambiguous_post}；`requiresCostConfirmation` 为 true 时视频卡必须先弹费用确认对话框。

**进程中断恢复**（`normalizeStaleInProgress`）：PROMPTING→PROMPT_PENDING、DOWNLOADING→DOWNLOAD_PENDING、SUBMITTING 陈旧（无 startedAt 或 >5min）→FAILED_SUBMISSION/AMBIGUOUS_POST。随后 `listRecoverable` 重入队：`state IN (snapshot_pending, prompt_pending, submission_pending, queued, running, cancel_requested, download_pending) AND (nextRetryAt IS NULL OR nextRetryAt <= now)`。

**调度**（WorkManager）：唯一名 `seedance-video-{localTaskId}`；初始入队 KEEP、Worker 内自延续重排 REPLACE（`enqueueDelayed`）；约束 `NetworkType.CONNECTED`；WorkData 仅 `localTaskId`（不落密钥/提示词/图片）；所有路径返回 success，由协调器自行重排，避免 WorkManager 退避风暴。

---

## 6. 参考图规则

来源：`video/SeedanceReferenceStore.kt`（校验+快照）+ `video/SeedanceSceneStore.kt`（全局背景）+ `AppContainer.kt`（编码压缩）。

### 6.1 格式 / 尺寸 / 大小（官方 V1 子集）

| 约束 | 值 |
|---|---|
| 支持 MIME → 扩展名 | `image/jpeg→jpg`、`image/png→png`、`image/webp→webp`、`image/bmp→bmp`、`image/gif→gif`。**heic/heif 一律拒绝**（魔数嗅探识别后由校验层拒绝） |
| 短边像素 | **> 300**（`REFERENCE_MIN_SIDE_PX`，不含） |
| 长边像素 | **< 6000**（`REFERENCE_MAX_SIDE_PX`，不含） |
| 宽高比 | **0.4 – 2.5**（含两端） |
| 字节上限 | **< 30MB**（`REFERENCE_MAX_BYTES`，不含）；**中转站媒体协议单张 ≤ 10MB**（`MEDIA_REFERENCE_MAX_BYTES`） |

校验失败返回中文原因（例：「角色立绘图片格式不支持（仅支持 JPG/PNG/WebP/BMP/GIF）」「…单边像素需大于 300 且小于 6000」「…宽高比需在 0.4-2.5 之间」「…不能超过 30MB」）。背景图与场景描述可选，不参与校验；角色立绘必填。

### 6.2 base64 编码要求

- 编码：`Base64.NO_WRAP`（无换行）。
- 传参格式：`"data:{mime};base64,{base64正文}"`（`mime` 不含 `data:` 前缀）。
- 原图不超限直接原样编码；**超限时降采样 + JPEG 质量梯度重编码**：目标长边 2560 起步逐级减半（2560→1280→640，下限 640），JPEG 质量 90 起每档减 10（下限 60），压缩后仍超限抛异常（按「参考图缺失或不可读」处理），**绝不发送可能被服务端拒绝的超限图片**。
- 流式源探测（assets/content URI）有界计数，超过 30MB 上限提前终止（防 OOM）。

### 6.3 快照语义（任务级不可变复制）

- 快照目录：`{filesDir}/seedance/tasks/{taskUuid}/references/`，文件 `character.{ext}`、`background.{ext}`。
- 内置角色从 assets 打开（路径归一化兼容 `file:///android_asset/...` / `asset://...` / 裸相对路径）；自定义角色解析 `file://` 内部路径（兼容百分号转义解码一次）；http/content scheme V1 不支持，返回失败。
- **先写 `.tmp` 再原子改名**；目标已存在时校验 SHA-256：一致复用、不一致直接失败（「快照文件已存在且内容不一致，无法安全覆盖」），任务转 FAILED_SNAPSHOT，**不回滚聊天回复**。
- 复制成功后，后续角色/背景被修改或删除不影响已复制的任务快照（任务不随源头变化而漂移）。
- 全局背景：`filesDir/seedance_scene/background.{ext}`，同一时刻仅一张；新图先完整写 tmp 成功后才删旧图并原子改名（失败时旧背景保持有效）。

---

## 7. 下载 / 保存

来源：`video/SeedancePipelineCoordinator.kt`（URL 有效期）+ `video/SeedanceVideoFileStore.kt`（落盘）+ `AppContainer.kt`（下载器）。

### 7.1 URL 有效期

- `output.video_url` 为签名 URL，**约 24 小时失效**（volcengine 官方文档值，`URL_TTL_MILLIS = 24 * 60 * 60_000`）。观测到 URL 时记 `remoteVideoUrlObservedAt`，`remoteVideoUrlExpiresAt = observedAt + 24h`。
- 过期判断只是兜底（成功轮询到 URL 后立即进入下载阶段，正常路径远早于过期）；过期 → `EXPIRED` / `URL_EXPIRED`，**重新生成需付费**，须用户确认。

### 7.2 下载

- 专用 HTTP 客户端：connect 15s / read **300s** / write 60s / call 600s（普通 API 客户端 read 60s / call 120s）。
- GET 签名 URL；非 2xx 或空体返回 null（按瞬时失败重试）。
- 响应 Content-Type → `mime` 提示；Content-Length → 完整性校验。

### 7.3 落盘校验（`SeedanceVideoFileStore.save`）

1. 写入 `{taskUuid}/video.part`，边写边算 **SHA-256**（同时保留头部 12 字节）；
2. 校验：总字节 > 0（空 → 失败「视频下载内容为空」）；Content-Length 存在且实际字节更少 → 截断失败；魔数或 MIME 判定格式失败 → 「下载内容不是受支持的视频格式」；
3. **原子改名**为 `video.{ext}` → 返回 `SeedanceVideoFile(path, mime, byteSize, sha256)`。

**格式判定**：魔数优先 —— 偏移 4 处 `ftyp` → `video/mp4`；`0x1A 0x45 0xDF 0xA3` → `video/webm`；回退响应 MIME（`video/` 前缀）。扩展名映射：`video/webm→webm`、`video/quicktime→mov`、`video/x-matroska→mkv`、`video/x-msvideo→avi`、其余 `→mp4`。成品文件名匹配 `video\.(mp4|webm|mov|mkv|avi)`。残留 `.part` 超过 1 小时（`STALE_PART_MILLIS`）视为可清理。

**幂等**：`verifyExisting(taskUuid, expectedSha256)` —— 既有成品文件存在且 SHA-256 一致 → 直接复用为 READY（重复 Worker 不重下）；仅凭 `.part` 残留绝不视为成品。

### 7.4 文件命名汇总

- 任务目录：`filesDir/seedance/tasks/{taskUuid}/`（`taskUuid = "auto-{userMessageId}-{millis}"`，落库时生成一次）
- 参考图：`references/character.{ext}`、`references/background.{ext}`
- 成品：`video.{ext}`
- 全局背景：`filesDir/seedance_scene/background.{ext}`

---

## 8. 触发策略

来源：`ui/chat/AutoVideoTriggerPolicy.kt` + `ui/chat/ChatViewModel.kt` + `data/repository/ChatCompletionRepository.kt`。

### 8.1 自动触发条件（`shouldCreateAutoVideo`，纯函数）

以下**全部成立**才在助手回复完成时创建自动视频任务：

1. **Provider == CLOUD**（云端聊天）。LOCAL 时 UI 层禁用开关（显示「仅云端可用」），本地聊天绝不触发；
2. **会话级开关 `autoVideoEnabled == true`**（`Conversation` 表列，新会话默认关闭，DB 迁移 `ALTER TABLE conversation ADD COLUMN autoVideoEnabled INTEGER NOT NULL DEFAULT 0`）。开启开关时先做准入检查：Seedance API Key 非空 + 角色立绘存在，不满足则提示并不落库开启；
3. **`completionState == COMPLETE`**（用户停止/超时/截断的部分回复不触发）；
4. **助手回复正文非空白**。

**快照语义**：发送起点捕获 `AutoVideoTriggerSnapshot{provider, enabled, userMessageId, apiConfig, seedanceConfig}` —— 生成期间切 Provider/开关/配置均不影响本次判定。任务携带全部来源/参数快照（角色信息、用户/助手文本、场景描述、提示词用的 baseUrl/model、角色立绘来源、背景来源、模型/分辨率/画幅/时长/水印），任务不随源头变化而漂移。

**同事务落库**：助手消息插入与自动视频 outbox 插入在**同一个 Room 事务**（进程在回复保存后立即死亡也不漏视频）；outbox 以 `INSERT IGNORE` 落库，**唯一索引 `(sourceAssistantMessageId, triggerType)`**（`"auto"`）冲突时忽略（同一回复不可能产生两条），聊天回复不回滚 outbox 冲突。事务提交后在工作管理器入队（KEEP），进程死亡由启动恢复 `recoverPending` 兜底。视频生成独立于 streamingJob，不阻塞下一轮对话。

### 8.2 手动操作

- **取消**：仅 `QUEUED` 可发起（CAS `QUEUED → CANCEL_REQUESTED`），结果以服务端状态为准；
- **重试**：入口状态映射见 §5.3；费用性重试（FAILED_REMOTE / EXPIRED / 歧义 FAILED_SUBMISSION）先弹费用确认对话框。

---

## 9. 硬编码常量总表

| 常量 | 值 | 出处 |
|---|---|---|
| 默认 `baseUrl` | `https://ark.cn-beijing.volces.com/api/v3` | SeedanceConfig |
| `STANDARD.modelId` | `doubao-seedance-2-0-260128` | SeedanceModelVariant（**带日期戳，版本敏感**） |
| `FAST.modelId` | `doubao-seedance-2-0-fast-260128` | SeedanceModelVariant |
| 时长范围 | 4–15 秒（两档一致） | SeedanceModelVariant |
| `DEFAULT_RELAY_MODEL_ID` | `kwvideo-v2-ref` | SeedanceClient |
| `SEEDANCE_TASKS_SUFFIX` | `/contents/generations/tasks` | SeedanceClient |
| `MEDIA_REFERENCE_MAX_BYTES` | 10MB（中转站单图上限） | SeedanceClient |
| `REFERENCE_MAX_BYTES` | 30MB | SeedanceReferenceStore |
| `REFERENCE_MIN_SIDE_PX` / `REFERENCE_MAX_SIDE_PX` | 300 / 6000 | SeedanceReferenceStore |
| `REFERENCE_MIN_ASPECT` / `REFERENCE_MAX_ASPECT` | 0.4 / 2.5 | SeedanceReferenceStore |
| 支持 MIME 映射 | jpeg/png/webp/bmp/gif | SeedanceReferenceStore |
| `URL_TTL_MILLIS` | 24h（86,400,000 ms） | SeedancePipelineCoordinator |
| `SUBMISSION_STALE_THRESHOLD_MS` | 5 min | SeedancePipelineCoordinator |
| `MAX_PROMPT_CONTEXT_TURNS` | 8 | SeedancePipelineCoordinator |
| `ERROR_CODE_AMBIGUOUS_POST` | `"AMBIGUOUS_POST"` | SeedancePipelineCoordinator |
| `MIN_DESCRIPTION_LENGTH` | 100 字 | SeedancePromptGenerator |
| `DEFAULT_MAX_AUTOMATIC_RETRIES` | 5 | SeedanceRetryPolicy |
| `DEFAULT_BASE_BACKOFF_MILLIS` | 15,000 ms | SeedanceRetryPolicy |
| `DEFAULT_MAX_BACKOFF_MILLIS` | 5 min | SeedanceRetryPolicy |
| `MAX_RETRY_AFTER_MILLIS` | 10 min | SeedanceRetryPolicy |
| `POLL_INTERVAL_MILLIS` | 10,000 ms | SeedanceRetryPolicy |
| `STALE_PART_MILLIS` | 1h | SeedanceVideoFileStore |
| 成品名正则 | `video\.(mp4\|webm\|mov\|mkv\|avi)` | SeedanceVideoFileStore |
| request-id 候选头 | `X-Request-Id` / `Request-Id` / `X-Tt-Logid` / `x-trace-id` | SeedanceClient |
| 探测任务 id | `__seedance_probe_check__` | SeedanceClient |
| 已知中转站主机 | `api.lk888.ai` / `api.lingkeai.ai` / `dm1124.com` / `lingkeai.vip` / `www.lingkeai.vip` | SeedanceClient |
| base 形态正则 | `^/v\d+$`、`^/api/v\d+$` | SeedanceClient |
| HTTP 超时（API） | connect 15s / read 60s / write 60s / call 120s | AppContainer |
| HTTP 超时（下载） | connect 15s / read 300s / write 60s / call 600s | AppContainer |
| 压缩参数 | 长边 2560→640 减半，JPEG 质量 90→60 步长 10 | AppContainer |
| user 消息截断 | 人设 800 / 前情 1500 / 用户 500 / 回复 1000 / 场景 300 / 前情单条 200 | SeedancePromptGenerator / AppContainer |
| 错误阶段码 | `SNAPSHOT/PROMPT/SUBMIT/REMOTE/QUERY/DOWNLOAD` | SeedancePipelineCoordinator |

**注意**：`config/AppConfig.kt` 中**没有** Seedance 相关常量——Seedance 常量全部在上述各文件中（与任务描述的预期位置不同）。

---

## 10. 源文件清单与版本注意事项

### 10.1 源文件清单（安卓项目，本次提取全部基于以下文件）

| 文件 | 内容 |
|---|---|
| `data\model\SeedanceConfig.kt` | 配置项、模型/分辨率/画幅枚举（§1） |
| `data\model\SeedanceVideo.kt` | 20 状态枚举 + 领域模型 + `prepareRetry` |
| `data\remote\SeedanceClient.kt` | 方舟/中转站双协议客户端、端点归一化、错误分类、探测 |
| `data\remote\SeedanceDtos.kt` | 全部请求/响应 DTO、错误标记词、中转站状态映射 |
| `video\SeedancePromptGenerator.kt` | 导演 system prompt、user 消息模板、JSON schema、buildFinalPrompt |
| `video\SeedancePipelineCoordinator.kt` | 状态机流转、每阶段动作、提交歧义/费用确认、requestFingerprint |
| `video\SeedanceRetryPolicy.kt` | 退避策略与轮询间隔常量 |
| `video\SeedanceRequestValidator.kt` | 请求校验 + canTransition 转换表 |
| `video\SeedanceReferenceStore.kt` | 参考图校验规则、快照复制、SHA-256、魔数嗅探 |
| `video\SeedanceSceneStore.kt` | 全局背景图安装/替换 |
| `video\SeedanceVideoFileStore.kt` | 成品落盘、格式判定、幂等校验 |
| `work\SeedanceVideoScheduler.kt` / `work\SeedanceVideoWorker.kt` | 调度/自延续重排/启动恢复 |
| `data\repository\ChatCompletionRepository.kt` | 助手消息 + outbox 同事务落库、唯一索引 |
| `data\repository\SeedanceVideoRepository.kt` / `data\local\SeedanceVideoDao.kt` | 仓库、CAS 认领、恢复扫描 SQL |
| `ui\chat\AutoVideoTriggerPolicy.kt` | 自动触发纯策略（§8.1） |
| `ui\chat\ChatViewModel.kt` | 发送起点快照、outbox 构建、重试/取消入口（§8） |
| `AppContainer.kt` | 装配、参考图压缩编码、视频下载、前情对话格式化 |

### 10.2 版本注意事项

1. **模型 ID 带日期戳**：`doubao-seedance-2-0-260128` / `doubao-seedance-2-0-fast-260128`（260128 = 2026-01-28）。网页版应把模型 ID 作为可配置项（默认值对齐），升级模型版本时只需改默认值。
2. **状态数**：任务需求描述为「14 状态」，源码实际为 **20 状态**（含 6 个 FAILED_* + EXPIRED + CANCEL_REQUESTED + FAILED_PROMPT_CONFIG_CHANGED），移植时以本文 §5 为准。
3. **`generate_audio` 恒为 true 且不可配置**（Seedance 2.0 生成音频不可关闭）。
4. **方舟 `4k` 小写 vs 中转站 `4K` 大写**：两个协议的分辨率拼写不同，移植时勿统一。
5. **POST 绝不自动重发**：`AMBIGUOUS_TRANSPORT`（网络层失败）与 5xx 均可能「服务端已建任务」，自动重发会重复计费——这是安卓端最核心的安全不变量，网页版必须保留（`requiresCostConfirmation` + `AMBIGUOUS_POST` 语义）。
6. **提示词 user 消息/最终 prompt 的长度截断上限**（800/1500/500/1000/300/200）与 **100 字质量红线**为硬性规则，移植时逐字保留。
7. **参考图约束（官方 V1 子集）**：JPG/PNG/WebP/BMP/GIF、单边 >300 且 <6000、宽高比 0.4–2.5、<30MB（方舟）/ ≤10MB（中转站）；heic/heif 拒绝。
8. 若网页版以本地存储替代 Room：唯一索引 `(sourceAssistantMessageId, triggerType)`、CAS 认领（`UPDATE ... WHERE state=:from`）、同事务落库、恢复扫描 SQL（§5.3）是状态机正确性的关键，需原样等价实现。
