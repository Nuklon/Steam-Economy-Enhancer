# <img src="assets/icon.svg" width="32" align="center"> Steam Economy Enhancer

[English](README.md) | 简体中文

Steam Economy Enhancer是一个用户脚本，用于增强Steam库存和Steam市场的功能。

## 功能

Steam市场增强功能:

*    检测价格过高和价格过低的物品
*    一次性选择5/25/全部（价格过高）物品并移除
*    （自动）重新上架价格过高的物品
*    按名称、价格或日期排序和搜索物品
*    显示卖家和买家的物品总价

Steam库存增强功能:

*    自动出售所有（选定的）物品或交易卡牌
*    使用*Shift*或*Ctrl*同时选择多个物品
*    在物品详情中添加市场出售和购买列表
*    快速出售按钮，无需确认即可出售物品
*    显示每个物品的最低挂牌价格
*    将选定的物品转换为宝石
*    拆开选定的补充包

Steam交易报价增强功能:

*    显示双方物品的摘要，包括物品总数、唯一物品数量和物品数量明细（每种物品有多少个）
*    选择当前页面的所有物品
*    显示每个库存物品的最低挂牌价格

价格可以基于最低挂牌价格、价格历史记录和您自己的最低和最高价格。
这些可以在Steam Economy Enhancer的设置中定义，您可以在页面顶部靠近*安装Steam*按钮的位置找到设置。

> [!注意]  
> 这是一个免费脚本，但不提供**任何**支持。如果您想添加功能，欢迎提交PR。

### 下载

[安装Steam Economy Enhancer](https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js)

*需要安装[Violentmonkey](https://violentmonkey.github.io/)或其他用户脚本管理器。*

### 安装

1. 首先安装一个用户脚本管理器：
   - [Tampermonkey](https://www.tampermonkey.net/) (推荐)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. 安装脚本：
   - 点击[这里](https://raw.githubusercontent.com/Nuklon/Steam-Economy-Enhancer/master/code.user.js)安装脚本

### 使用方法

#### 库存页面

在Steam库存页面，脚本会添加以下功能按钮：

- **出售所有物品**：将所有可售物品上架到Steam市场
- **出售所有重复物品**：仅将重复的物品上架到市场
- **出售所有卡牌**：仅将交易卡牌上架到市场
- **出售所有箱子**：仅将箱子上架到市场（仅在TF2库存中显示）
- **将所有重复物品分解为宝石**：将所有重复物品转换为宝石
- **拆开所有补充包**：拆开所有的补充包

选择物品后，还会显示以下按钮：

- **出售选中物品**：将选中的物品上架到市场
- **手动出售**：打开Steam的批量出售界面
- **将选中物品分解为宝石**：将选中的物品转换为宝石
- **拆开选中补充包**：拆开选中的补充包

#### 市场页面

在市场页面，脚本会增强市场列表的功能，并提供更多信息和操作选项。

#### 交易报价页面

在交易报价页面，脚本会显示物品的价格标签，并计算交易双方的物品总价值。

### 设置

点击页面顶部的"Steam Economy Enhancer"按钮打开设置面板，可以配置以下选项：

- 语言选择（英文或简体中文）
- 价格计算方式
- 价格显示和过滤选项
- 最低和最高价格设置
- 其他功能开关

### 截图

*市场*

![市场](assets/market.png)


*库存*

![库存](assets/inventory.png)


*设置*

![设置](assets/settings.png)


*交易报价*

![交易报价](assets/tradeoffer.png)

### 贡献

欢迎提交问题报告和功能请求到[GitHub Issues](https://github.com/Nuklon/Steam-Economy-Enhancer/issues)。

### 许可证

[MIT](LICENSE) 