# 生产日志与审计边界

本项目的模型解析、转换和导出全部在浏览器本地执行，服务端没有业务 API、登录、权限、配置、材料价格、数据导出或后台任务。因此本次只记录 Next.js 服务启动、服务端 HTTP 请求结果和服务端异常；不虚构审计事件，也不记录浏览器内的模型解析、转换或导出行为。为遵守这一边界，页面原有的 Umami 脚本及解析、转换、导出、下载等客户端事件上报已移除，项目不再新增或保留远程遥测。

## 日志输出

- 服务名：`unionam-converter`
- 格式：UTF-8 单行 JSON（JSONL）
- 默认文件：`/var/log/unionam/unionam-converter/application.jsonl`
- 同时输出：stdout；文件不可写时输出仍保留，PM2/systemd 可继续采集 stdout/stderr
- 可选覆盖：进程环境变量 `UNIONAM_APPLICATION_LOG_PATH`（只作为启动配置使用，日志不会打印环境变量内容）
- 必备字段：`time`、`level`、`service`、`environment`、`event`、`result`、`request_id`、`duration_ms`、`error_code`

生产主机需在部署前创建目录并授予运行账号写权限，例如：

```bash
sudo install -d -m 0750 -o <runtime-user> -g <runtime-group> /var/log/unionam/unionam-converter
sudo touch /var/log/unionam/unionam-converter/application.jsonl
sudo chown <runtime-user>:<runtime-group> /var/log/unionam/unionam-converter/application.jsonl
sudo chmod 0640 /var/log/unionam/unionam-converter/application.jsonl
```

如果文件初始化或写入失败，应用会降级到 stdout/stderr，日志故障不会使 HTTP 请求失败。

## 事件清单

| 事件 | 条件 | 结果 |
| --- | --- | --- |
| `service.started` | Next.js 准备完成并开始监听 | `success` |
| `service.start.failed` | Next.js 准备或监听初始化失败 | `failure` |
| `http.request.completed` | 服务端 HTTP 响应状态小于 400 | `success` |
| `http.request.rejected` | 服务端 HTTP 响应状态为 4xx | `rejected` |
| `http.request.exception` | 请求处理器抛出未处理异常 | `failure` |
| `http.request.failed` | 连接提前关闭，或服务端 HTTP 响应状态为 5xx | `failure` |
| `http.connection.rejected` | Node HTTP 层拒绝畸形请求 | `rejected` |
| `process.uncaught_exception` | 进程出现未捕获异常 | `failure` |
| `logging.transport.failed` | 文件日志不可用，已降级 | `degraded` |

每个正常进入应用的请求都会由服务端生成新的 UUID，并通过 `X-Request-ID` 响应头返回。公网请求携带的 `X-Request-ID` 不会被采纳。

## 数据最小化与脱敏

日志不读取或记录请求 URL、查询参数、请求头、请求正文、客户端 IP、Authorization、Cookie、Token、密码、验证码、AccessKey、环境变量、签名 URL、文件名、模型/图片内容，以及文件格式、尺寸、体积、三角面等模型信息。

统一递归脱敏器会按不区分大小写、忽略分隔符后的字段名匹配并替换为 `[REDACTED]`，至少覆盖：

`password`、`token`、`authorization`、`cookie`、`secret`、`phone`、`email`、`access_key`、`signature`、`verification_code`、`verify_code`、`captcha`、`otp`、`environment_variable`、`env_var`。

同时禁止 `body`、`payload`、`filename`、`filepath`、`fileformat`、`filesize`、`dimension`、`volume`、`triangle`、`modelcontent`、`imagecontent`、`signedurl` 等内容字段。外部字符串中的 CR、LF、Tab 和其他控制字符会转义，字符串最多保留 512 个字符，防止日志注入和无界增长。异常对象、错误消息和堆栈不写入日志，只使用稳定的 `error_code`。

## 构建、上线与验收（仅供人工执行）

本仓库未执行部署。推荐发布步骤：

```bash
npm ci
npm test
npm run typecheck
npm run build
NODE_ENV=production NEXT_DIST_DIR=.next-build npm start
```

PM2/systemd 应继续托管 `npm start`，并保留 stdout/stderr。若部署定义绕过 `npm start`、直接运行 `next start`，必须改为运行 `node server.mjs`，否则不会建立服务端 request ID 和访问日志。

验收命令：

```bash
curl -sS -D - -o /dev/null -H 'X-Request-ID: untrusted-value' http://127.0.0.1:3000/converter
tail -n 5 /var/log/unionam/unionam-converter/application.jsonl
tail -n 5 /var/log/unionam/unionam-converter/application.jsonl | jq -c .
```

验收时确认响应存在新的 `X-Request-ID`，且日志中的 `request_id` 与响应一致、不是 `untrusted-value`；每行均可被 `jq` 解析，敏感数据与文件/模型元数据均不存在。

## 回滚

回滚到上一已验证版本并恢复该版本原有启动定义，然后重新构建和重启进程。若使用 Git 标签，可人工执行：

```bash
git switch --detach <previous-release-tag>
npm ci
npm run build
<process-manager-restart-command>
```

日志文件可保留供审计，不需要在应用回滚时删除。不要使用会清除工作树或日志的破坏性回滚命令。

## SLS / LoongCollector 人工配置项

本次不修改 SLS、OSS、Nginx 或 LoongCollector。上线时由运维人工完成：

1. 为 LoongCollector 增加文件采集路径 `/var/log/unionam/unionam-converter/application.jsonl`，解析格式选择单行 JSON。
2. 以 `time` 为日志时间，确认时区按 ISO 8601 UTC 解析；建立 `level`、`service`、`environment`、`event`、`result`、`request_id`、`duration_ms`、`error_code`、`http_method`、`status_code` 字段索引。
3. 配置文件轮转与采集游标，避免应用自行截断文件；确认运行账号和采集账号均具备所需的最小权限。
4. 配置 5xx、`service.start.failed`、`process.uncaught_exception` 和 `logging.transport.failed` 告警，并用测试请求验证 request ID 可检索。
5. 根据组织制度设置 SLS 保存周期、访问控制和归档策略；不要把日志复制到未经批准的远程遥测系统。
