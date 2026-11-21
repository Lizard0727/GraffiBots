# 涂鸦机兵 · Godot 版（移植中）

用 Godot 4.3 重做的涂鸦机兵。现在是第二阶段：

- **全部 22 台机体、21 位驾驶员**：攻击方式、特性、大招、技能（充能制）、被动、机体被打爆后驾驶员弹出 + 随身武器、空投新机体
- **全部 14 张地图**，菜单里可以选地图或随机
- **画面**：卡通三段明暗 + 描边的机兵、双三次过滤 + 噪声边缘的泼溅涂料（两队交界清楚）、霓虹灯条、城市夜景、电脑版 Forward+（SSAO、辉光、ACES 色调、雾）
- **手感**：走路摆腿 / 落地压扁 / 开火后坐、镜头跟随瞄准方向、爆炸震屏、击毁时短暂停顿、大招镜头拉伸、地面瞄准线 / 曲射落点圈、程序合成音效
- 下一阶段：超载技能 + 其余 10 种模式

- **下载**：GitHub Releases 里的「Godot 版（最新）」——Windows（解压后双击 `GraffiBots.exe`）、安卓 APK、网页版
- **网页版**：官网的 `/godot/` 路径（网页 / 手机用 GL Compatibility 渲染，电脑用 Forward+）
- **数据**：`godot/data/game.json` 由 `node tools/export-godot-data.js` 从 `public/shared.js` 自动生成（数值和网页版完全一致）
- **代码**：`scripts/sim.gd` 对战模拟（移植自 shared.js / core.js）、`scripts/game.gd` 画面 / 特效 / 镜头 / 输入 / 菜单、`scripts/models.gd` 机兵和道具模型、`scripts/sfx.gd` 音效、`scripts/hud.gd` HUD、`shaders/` 涂料 / 卡通 / 描边着色器
- **测试**：`godot --headless --path godot --script res://tests/sim_test.gd`（全阵容轮流上场打 6 局，检查所有技能和大招）
- **自动构建**：`.github/workflows/godot.yml`

操作：WASD 移动 • 鼠标瞄准 • 左键攻击 • Q 技能 • E / 右键大招 • Shift 滚轮 • 空格跳 • Esc 菜单。手机：左摇杆移动、右摇杆瞄准并攻击、右下角按钮。
