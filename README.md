# MipMap Lite Documentation

基于 VitePress 的 MipMap Lite 文档站点，支持多语言和本地搜索。

## 安装和运行

### 安装Node

本文档开发需要先配置Node环境，访问[NodeJS官网](https://nodejs.org/zh-cn/download)下载LTS版本进行安装。

### 安装项目依赖

打开Windows终端，执行以下命令安装`yarn`。

```bash
npm install -g yarn
```

在本项目根目录下安装项目所需依赖：


```bash
yarn
```

需要更新文档时，执行以下命令启动开发服务：

```bash
yarn dev
```

开发服务启动后，可以在浏览器打开4002端口来预览文档，在编辑器中修改文档内容后，浏览器可以看到文档视图实时更新。

## 构建与部属

完成编辑后，执行以下命令生成部署安装包：

```bash
yarn build
```

构建完成后，将 `build/` 目录部署到你的托管服务。

## 导出 PDF

导出pdf之前，需要先在主机安装 [Pandoc](https://pandoc.org/installing.html)，下载最新的安装包按提示安装即可。

默认使用 `xelatex` 作为 PDF 引擎，Windows 建议安装 MiKTeX 或 TeX Live，可以从[MikTex官网](https://miktex.org/download)下载安装。

安装完以上环境后可使用以下命令将文档导出为pdf导出，其中`--lang`参数可指定需要导出的语言版本。

```bash
yarn export:pdf -- --lang=fr
```

常用命令：

```bash
# 导出英文版文档
yarn export:pdf:en

# 导出中文版文档
yarn export:pdf:zh
```

可选参数：

```bash
npm run export:pdf -- --lang=zh-Hans --engine=xelatex
```

导出文件位于 `build/pdf/`，文件名形如 `mipmap-lite-docs-cn.pdf`。
