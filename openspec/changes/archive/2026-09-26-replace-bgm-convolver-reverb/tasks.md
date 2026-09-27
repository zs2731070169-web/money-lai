# tasks：BGM 混响卷积换 FDN

- [x] 1 tests/audio/bgm.test.ts 新增「混响不建 ConvolverNode」契约用例（包装 createConvolver 抛异常），运行确认先红
- [x] 2 bgm-player.ts 重写 createBgmReverbChain 为立体声 FDN（8 延迟线 + 循环低通 + 交叉馈给），接口不变，头注释更新
- [x] 3 新增湿尾渲染不变式用例（脉冲→尾音能量/防爆/无 NaN），npm test + npx tsc --noEmit 通过
- [ ] 4 部署模拟器实听：咔哒消失且混响听感不劣化后勾选
- [x] 5 变更目录归档（skip_specs，无主规格同步）
