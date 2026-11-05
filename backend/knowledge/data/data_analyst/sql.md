# SQL 窗口函数
## 核心概念
窗口函数可以在不压缩行数的前提下，基于一个“窗口分组”计算统计值。
区别于GROUP BY：group by 会合并多行成一行；窗口函数保留原始行，附加统计结果。

## 关键区别
- GROUP BY：聚合，行折叠，每组输出一行。
- OVER()窗口函数：开窗，不折叠，每行都附带本组统计信息。
常用：ROW_NUMBER(), RANK(), DENSE_RANK()

## 常见面试问题
1. ROW_NUMBER、RANK、DENSE_RANK三者区别？
2. PARTITION BY 和 ORDER BY 在OVER里面分别作用是什么？
3. 怎么求每个分组内排名前N的数据？

## 常见错误
忘记PARTITION BY导致全局排名；在WHERE里直接使用窗口函数（窗口函数不能放where，要用子查询CTE）。

## 来源
MySQL 8.0官方文档、《SQL必知必会》
