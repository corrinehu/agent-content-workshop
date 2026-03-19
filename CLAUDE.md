# SecondMe 集成项目

## 应用信息

- **App Name**: Agent Content Workshop
- **Client ID**: df2d9bf2-***

## API 文档

开发时请参考官方文档（从 `.secondme/state.json` 的 `docs` 字段读取）：

| 文档 | 配置键 |
|------|--------|
| 快速入门 | `docs.quickstart` |
| OAuth2 认证 | `docs.oauth2` |
| API 参考 | `docs.api_reference` |
| 错误码 | `docs.errors` |

## 关键信息

- API 基础 URL: https://api.mindverse.com/gate/lab
- OAuth 授权 URL: https://go.second.me/oauth/
- Access Token 有效期: 2 小时
- Refresh Token 有效期: 30 天

> 所有 API 端点配置请参考 `.secondme/state.json` 中的 `api` 和 `docs` 字段

## 已选模块

| 模块 | 说明 | 来源 Scope |
|------|------|-----------|
| auth | OAuth 认证（必选） | user.info |
| profile | 用户信息展示 | user.info.shades, user.info.softmemory |
| chat | 聊天功能 | chat |
| act | 结构化动作判断 | chat（权限复用） |

## 权限列表 (Scopes)

根据 App Info 中的 Allowed Scopes：

| 权限 | 说明 | 状态 |
|------|------|------|
| `user.info` | 用户基础信息 | 已授权 |
| `user.info.shades` | 用户兴趣标签 | 已授权 |
| `user.info.softmemory` | 用户软记忆 | 已授权 |
| `chat` | 聊天功能 | 已授权 |
