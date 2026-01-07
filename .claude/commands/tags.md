请为 commit $ARGUMENTS 添加 tag, 如果 $ARGUMENTS 为空, 则为当前最新的 commit 添加 tag

请遵循以下要求:
1. 使用 !`git tag` 获取当前所有的tag列表
2. 对比最新的已存在的tag,与指定的commit之间的代码, 概括性的总结代码变动情况,代码变动的分类如下:
    1. feature:新增功能特性
    2. refactor:表示代码重构,功能不变
    3. fix:表示修复了现存的bug
3. 检查插件的版本信息后,在原有tag列表的基础上,生成新的tag,分为如下两种情况:
    1. 插件版本已经更新到最新,与待添加的tag版本保持一致, 则直接添加tag.
    2. 插件版本信息未更新,请修改插件版本到待添加的tag版本, 生成一个新的commit, 在新的commit上添加tag, commit请不要带作者信息
4. 为新生成的tag添加上述总结的描述信息
