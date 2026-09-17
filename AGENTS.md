# 项目说明书

AI 在每次新对话开始工作前，必须优先读取本文件，并遵守以下硬性规定。

## 硬性规定

1. 每次改动后必须创建对应的 Git commit，便于追踪和回滚。
2. 每次改动后必须编写或更新测试，交付前确保所有测试和验证通过。

## 验证方式

运行 `powershell -NoProfile -ExecutionPolicy Bypass -File tests/verify-agents.ps1`，验证本说明书的必要内容。后续增加项目功能时，应同步增加相应的功能测试，并在交付前运行全部测试及相关验证。
