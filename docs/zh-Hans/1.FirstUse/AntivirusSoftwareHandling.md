---
title: 杀毒软件处理
sidebar_position: 3
---
## 杀毒软件处理

部分杀毒软件，如360安全卫士、360杀毒，容易将软件识别为病毒软件，阻止软件安装或隔离软件的部分文件导致点击重建便立马失败。

实际这是因为我们对软件加密造成的误报，从官方渠道(https://www.mipmap3d.com/download)下载的软件，您可以放心使用！

遇到这类情况，我们有两个解决方案：

### 恢复隔离文件

打开360安全卫士，点击木马查杀，点击恢复区

![](/img/cn-img/image13.png)

在可恢复区以及已阻止区找到名称带有MipMap的隔离文件。选中文件，点击恢复所选

![](/img/cn-img/image14.png)

### 将软件安装目录加入信任区

打开360安全卫士，点击木马查杀，点击信任区

![](/img/cn-img/信任区.png)

在已信任区页面，点击添加目录

![](/img/cn-img/image16.png)

在弹出的目录选择页面，选择mipmap lite安装目录（默认安装在C:\\Program Files\\MipMap\\MipMapLite），点击确定。

![](/img/cn-img/信任目录.png)