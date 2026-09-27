# design：模拟器启动脚本

- 参数：`--fast` 跳过构建（沿用 ios/DerivedData 里最近一次构建产物），默认全量构建。
- 流程：terminate 旧进程（忽略未运行错误）→ 可选 build → cap sync → xcodebuild → install → launch → 提示完成。
- 模拟器名默认 `iPhone 17`，可用环境变量 `SIM` 覆盖；App id `com.hariku.moneylai`。
