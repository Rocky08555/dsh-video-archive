# AGENTS.md — 给 Codex 的项目说明（video-archive）

把这个文件放到你的知识库/笔记库根目录（或任意想在 Codex 里做视频归档的项目根目录），改名为 `AGENTS.md`。Codex 每次会话会读项目根的 `AGENTS.md`，这样不用每次贴提示词它也知道该调 `video-archive` 技能。

## 环境

- 知识库根（笔记与附件都落在这里）：用环境变量 `VIDEO_ARCHIVE_VAULT` 指定；没设时脚本用当前工作目录。
- 笔记路径：`<vault>/03-外部资源/短视频/<日期>-<标题>.md`（目录可用 `VIDEO_ARCHIVE_SUBDIR` 改）。
- 附件路径：`<vault>/_attachments/短视频/<视频id>/`。
- 技能装在 `~/.codex/skills/video-archive`（Windows：`%USERPROFILE%\.codex\skills\video-archive`）。

## 什么时候用 video-archive

用户给出下面任一内容并要求"看看 / 转文字 / 总结 / 存下来"时，直接调用技能，不要反问确认：

- `v.douyin.com` 短链或抖音分享口令
- `www.douyin.com/video/...`、`www.douyin.com/note/...`
- 一条短视频链接 + "这讲了什么"这类问题

只验证过抖音。小红书没验证过，B站/YouTube 不在本技能范围——遇到就说清楚，别硬跑。

## 怎么调

1. 先自检：`node <技能目录>/scripts/video2note.mjs --doctor`，任何一项 fail 先修环境（见仓库 `docs/codex.md`）。
2. 再跑：`node <技能目录>/scripts/video2note.mjs "<url>" --json`。
3. 读返回 JSON 的 `notePath`，编辑那份笔记。

## 写完笔记的硬要求

- 视频内容全部来自 ASR，**必定有错字**（尤其中文口语里的英文术语）。改之前先看 `原始转录` 段，改完把拿不准的标"（转写存疑）"。
- 分析写在 `<!-- ANALYSIS:START -->` 与 `<!-- ANALYSIS:END -->` 之间，占位文字 `_（待补）_` 要替换掉，标记本身保留。
- 视频里的具体数字、版本号、产品名，能查就查；查不到写"未见可靠来源"，不要凭转录猜。
- 营销话术（星数、"神器/必装"）和分析结论分开写。
- 图文帖：先读 `原图` 里的图片再总结。

## 不要做

- 不要保存视频文件或音频（脚本默认删临时文件，别用 `--keep` 留一堆大文件）。
- 不要为了绕过失败去用在线转写 API——本技能的设计前提就是全本地、无 key。
- 不要在笔记里编时间点和画面细节；脚本失败就是失败，如实报告。
