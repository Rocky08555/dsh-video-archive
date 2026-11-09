# 微信接入：手机发链接，笔记进 Obsidian

**这不是本包的功能。** 微信这条链路是 DSH 的 IM 集成（`dsh-weixin`）+ 本技能组合出来的：集成负责把微信消息变成 DSH 会话，技能负责把链接变成笔记。

链路：

```
手机微信 → dsh-weixin 配对机器人 → 绑定的 DSH 会话（workspace = 你的知识库）
        → agent 触发 video-archive 技能 → video2note.mjs 写笔记
        → <vault>/03-外部资源/短视频/ + <vault>/_attachments/短视频/<id>/
```

前提：

- DSH 桌面版常开在能抓到抖音的那台机器上（需要 Edge、Python+faster-whisper、ffmpeg，先按 [install.md](install.md) 装好）。
- 本技能已装进当前 DSH profile，会话里能看到 `video-archive`。
- 知识库路径固定，别随便挪。

## 1. 配对机器人

DSH 侧配置在 `~/.dsh/integrations/dsh-weixin/`：

```
config.json        accounts[]：botId、accountId、tokenRef、ownerUserId
workspaces.json    botId → 工作目录、preset、模型、访问策略
accounts/<botId>/state.json   会话映射、消息游标（集成自己维护）
```

在 DSH 的集成面板里完成微信机器人配对（入口和交互以你的 DSH 版本为准）。配对成功后 `config.json` 的 `accounts[]` 会出现一条账号记录，形如：

```json
{
  "botId": "wx_你的botId",
  "accountId": "你的accountId@im.bot",
  "tokenRef": "DSH_WEIXIN_BOT_TOKEN_<大写botId>",
  "ownerUserId": "你的openid@im.wechat",
  "connectedAt": "..."
}
```

下面所有 `<botId>` 都指这里的值。token 存在凭据存储里（`tokenRef` 只是引用名），不要把它写进任何文档或仓库。

## 2. 让这个 botId 的 workspace 指向知识库

编辑 `~/.dsh/integrations/dsh-weixin/workspaces.json`：

```json
{
  "version": 2,
  "workspaces": { "wx_你的botId": "D:\\我的知识库" },
  "agentPresets": { "wx_你的botId": "standard" },
  "models": {
    "wx_你的botId": {
      "provider": "deepseek-account",
      "model": "deepseek-flash",
      "reasoningEffort": "low"
    }
  }
}
```

`workspaces` 的值就是 agent 的工作目录，也就是 `VIDEO_ARCHIVE_VAULT` 的默认值（脚本没设这个变量时用工作目录）。这里指向知识库根，笔记才会落到知识库里的 `03-外部资源/短视频/`。

## 3. 放行访问策略

同一个文件里的 `accessPolicies`，键是 botId：

```json
{
  "accessPolicies": {
    "wx_你的botId": {
      "direct": {
        "mode": "allowlist",
        "open": { "defaultCanExecuteCommands": false, "commandPermissionOverrides": [] },
        "allowlist": { "users": ["你的openid@im.wechat"] }
      },
      "group": {
        "mode": "allowlist",
        "open": { "defaultCanExecuteCommands": false, "commandPermissionOverrides": [] },
        "allowlist": { "users": ["你的openid@im.wechat"] }
      }
    }
  }
}
```

- `mode`：`allowlist` 只放行名单里的人，`open` 放行所有能发到机器人的人。只自己用就 `allowlist`，名单里放自己的 `*@im.wechat`（`ownerUserId`）。
- `defaultCanExecuteCommands` 保持 `false`：允许跑命令等于允许微信端在本机执行任意命令，没有必要放开。
- `direct` 是私聊，`group` 是群聊，两个都要配。

改完重启 DSH，或者让集成重连，新配置只对**新建的会话**生效。

## 4. 手机上发链接

抖音 App → 分享 → 复制链接，粘到微信对话里发出去。分享口令里的乱码不用管，skill 自己会认 `v.douyin.com`。

## 5. 触发技能

正常情况下 agent 看到链接会按技能描述自动触发。不确定就明说一句：

```
用 video-archive 存档 https://v.douyin.com/xxxxx/
```

agent 会依次：`--doctor` 自检 → 抓页面 → 判视频还是图文 → 转写/下原图 → 写笔记 → 补 `## 分析总结` 区 → 回你笔记路径。

## 6. 结果在哪

```
<workspace>/03-外部资源/短视频/YYYY-MM-DD-<标题>.md
<workspace>/_attachments/短视频/<视频id>/f1.jpg … f4.jpg
```

微信里会回一条带路径的消息。文件系统做了同步（iCloud/坚果云/Syncthing 等）的话，手机上也能直接看到。

## 排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 笔记落到旧目录/别的项目目录 | 会话是改配置之前建的。`state.json` 里 `sessions` 保存了 `p2p:<用户> → sessionId` 的旧映射，老会话还绑着旧工作目录 | 重启 DSH 后让它开新会话；需要立刻换目录就删掉状态里的会话映射（`accounts/<botId>/state.json`，集成自己维护，删前先停 DSH），或者直接在对话里说「换工作目录到 X」让它在新目录里执行 |
| 微信发了消息没反应 | 桥没启动：DSH 没开、集成断线、token 失效 | 看 DSH 是否在运行、集成面板是否显示已连接；`config.json` 里那个 `connectedAt` 是建账号的时间，别拿它当在线状态 |
| 消息进了但没跑技能 | 技能没加载：包里没有、profile 没登记、没重启 | 会话里问「有什么技能」确认 `video-archive` 在；不在就按 [install.md](install.md) 装进 profile 再重启 |
| agent 说找不到脚本/命令 | 环境变量没生效，或脚本路径不对 | 在 DSH 会话里跑 `node skills/video-archive/scripts/video2note.mjs --doctor`，看 `edge`/`fasterWhisper` |
| 能抓页面但转出来是空的 | Python 环境不对 / 音轨没抓到 | `--doctor` 看 `fasterWhisper`；抓不到音轨会报 `no media stream` |
| 转写一堆错字 | 语音识别正常误差 | 让 agent 对照画面快照改 `## 分析总结`，拿不准标「转写存疑」 |
| 群里谁都能触发 | `accessPolicies.group.mode` 是 `open` | 改 `allowlist` 并只放行自己 |

## 安全提醒

微信侧的一条消息等于一次「让本机 agent 干活」的授权。所以：

- 只给自己开白名单，不要把机器人拉进公开群。
- `defaultCanExecuteCommands` 保持 `false`。
- 机器人 token 存在 DSH 凭据里，不要贴进聊天、截图或仓库。
