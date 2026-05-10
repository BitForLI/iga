# IGA 后端（ASP.NET Core）

本目录包含 **`igaServer.csproj`** 与全部 API 源码。

## Railway / Railpack

在托管平台的 **Service → Settings → Root directory** 中必须填写：

```text
backend
```

若保留为仓库根目录 `/`，构建会在根路径查找 `.csproj`，会出现 **「could not determine how to build the app」**。将根目录设为 `backend` 后，Railpack 才会扫描到 `igaServer.csproj`。

可选：**Watch paths** 设为 `backend/**`，避免仅前端变更触发后端重建。

本地运行：

```bash
cd backend
dotnet run --launch-profile http
```
