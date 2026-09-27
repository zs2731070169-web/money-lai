# 设计：纸币堆与钱包口交叠

现有 `billStackTopLayerPeekTopY` 统一决定钱包内堆顶张和活动纸币 ratio=0 的起点，`billDrawTravelDistance` 由该起点推导抽出距离。将 `BACK_LAYER_PEEK_PIXELS` 从当前工作树的 56 调到 60，堆顶张由折线上方 31 移至 35 逻辑像素。保持层间步距、票面尺寸、钱包位置与口沿裁剪不变。

几何测试检查 ratio=0 的新位置、各层相对位置及 ratio=1 的终点；在 iPhone 模拟器实际画面确认交叠处没有明显错位。真机检查项留在视觉清单中。
