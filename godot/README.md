# 涂鸦机兵 · Godot 样品版

用 Godot 4.3 重做的样品：1 张地图（霓虹工厂）、2 台机体（喷罐 / 狙击）、2 位驾驶员（凌焰 / 白夜）、4 对 4 涂地大战 + AI。
用来比较 Godot 版和现在网页版的手感、画面、帧率、加载速度，决定要不要全面移植。

- **下载**：GitHub Releases 里的「Godot 样品版（最新）」——Windows（解压后双击 `GraffiBots.exe`）、安卓 APK、网页版
- **网页版**：官网的 `/godot/` 路径
- **数据**：`godot/data/game.json` 由 `node tools/export-godot-data.js` 从 `public/shared.js` 自动生成（数值和网页版完全一致）
- **代码**：`scripts/sim.gd` 对战模拟（移植自 shared.js / core.js）、`scripts/game.gd` 画面 / 输入 / 菜单、`scripts/hud.gd` HUD、`shaders/turf.gdshader` 圆滑涂料
- **测试**：`godot --headless --path godot --script res://tests/sim_test.gd`（8 个 AI 打一整局）
- **自动构建**：`.github/workflows/godot.yml`

操作：WASD 移动 · 鼠标瞄准 · 左键攻击 · Q 技能 · E / 右键大招 · Shift 滚轮 · 空格跳。手机：左摇杆移动、右摇杆瞄准并攻击、右下角按钮。
