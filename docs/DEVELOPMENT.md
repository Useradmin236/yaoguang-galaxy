# 维护说明

## 文件结构

| 文件 | 用途 |
| --- | --- |
| `app.js` | 场景、相机、选取、近景、导航与星象 |
| `data.js` | 瑶光、六颗行星与十四颗卫星的数据 |
| `materials.js` | 表面、云层、大气和环系材质 |
| `looks.js` / `looks.css` | 四种观看风格 |
| `discoveries.js` / `discovery.css` | 观测手记与探索反馈 |
| `gallery.html` | 实际渲染截图对比 |
| `vendor/` | 本地依赖、字体、纹理、肖像与预览 |
| `tools/` | 离线纹理和截图生成器 |
| `tests/` | 逻辑与浏览器检查 |

## 配置入口

`data.js` 的 `url` 是服务入口，`base` 是可复制的 API 示例地址；卫星的 `url` 或 `copy` 提供相应操作。当前使用 IANA 保留的 `example.com` 示例域名。服务凭据不应写入浏览器代码。

星球名称与视觉分别定义：修改功能入口不会改变天体外观。素霰的空入口对应预留状态。轨道距离与显示半径经过艺术化压缩，并非同比例天文模拟。

## 运行与测试

`python server.py` 默认只监听 `127.0.0.1:43178`，静态服务器只开放页面资源与 `vendor/` 中的文件。环境变量 `PORT` 可指定其他端口。

`npm test` 启动临时服务器并串行运行检查；测试完成后关闭该服务器。可以用 `PYTHON` 指定 Python 可执行文件，用 `PLAYWRIGHT_BROWSERS_PATH` 指定已有浏览器目录。测试结果和截图位于被 Git 忽略的 `artifacts/`。

运行单项浏览器检查时，先启动 `server.py`，再运行相应 `node tests/<文件名>.cjs`；服务不在默认端口时设置 `PREVIEW_URL`。

## 更新截图

先运行本地服务器，再执行：

```console
npm run capture:portraits
python tools/export-portraits.py
npm run capture:looks
python tools/export-previews.py
node tests/gallery.cjs
```

Python 素材工具需要 Pillow。生成中文对比图前，将 `PREVIEW_FONT` 环境变量设为本机可用中文字体文件的路径；该路径不进入仓库。肖像和预览均来自实际页面渲染。

## 更新纹理

`bake-worlds.cjs` 生成六颗行星的原创球面地图，`bake-nebula.cjs` 生成背景，`refine-clouds.py` 重映射云图，`optimize-textures.py` 生成运行时 WebP。修改源图后需要重新执行相关生成器并更新预览。

保留素材原始署名与许可；云图和环系的衍生资产继续遵守对应来源的许可。
