# 安装与备份（开发预览）

## 从源码在群晖构建

1. 将项目源码放在 NAS 的独立目录，例如 /volume1/docker/jiayoushu。
2. 将 .env.example 复制为 .env，填写自己的 NAS_BIND_IP 和 APP_ORIGINS。端口示例为20001；如端口已被占用需更改。
3. 在项目目录运行 sudo docker compose config --quiet 检查配置。
4. 运行 sudo docker compose up -d --build 构建并启动。
5. 浏览器打开 http://你的NAS局域网IP:20001/ ，首次只创建一个管理员。
6. 在账户与资产建立账户，再进入月度填报。新增账户的初始余额不是收入。

当前 compose.yaml 仍指向本地构建镜像 jiayoushu:local，没有声称已经发布到 Docker Hub。

## 数据目录

./data 挂载到容器 /data，账本为 family.sqlite，备份在 data/backups。删除容器不等于删除这个目录；不要删除 data 来更新软件。

容器使用普通用户（UID1000）。目录权限问题需检查 NAS 上该目录的所有权与访问权限，不要把整台 NAS 目录设为任意人可写。

## 反向代理

APP_ORIGINS 须包含浏览器实际使用的完整地址，包括HTTPS协议、域名及非默认端口；多个地址用英文逗号分隔。示例域名 finance.example.com 必须替换为自己的域名。

群晖反向代理目的地指向本机的应用端口，转发浏览器原始 Host（含外网端口）。先在局域网完成管理员创建和登录验证，再配置自己的外网访问。

## 升级与恢复

升级前从设置下载完整备份，另存到NAS之外。复制底层数据目录时先停止容器，确保SQLite主文件及伴随文件保持一致。再更新代码并构建，启动后验证登录、账目和保存功能。

完整账本备份不替换当前登录密码或恢复码。恢复需管理员核验，操作前会创建安全副本。忘记管理员密码可使用保存的恢复码，或在NAS终端运行 sudo docker compose exec app node reset-password.cjs 登录名，按提示输入新密码。

若升级涉及数据库结构变化，退回旧镜像可能需要同时恢复升级前的备份。开发预览尚未提供长期版本迁移保证。
