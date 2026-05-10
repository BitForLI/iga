-- 清空所有注册用户及订单（保留商品、店铺配置、Stripe 事件幂等表）。
-- 与本地命令等价：dotnet run -- --clear-users（Development）
--
-- 生产环境请在 Railway Postgres「Query」或 psql 中执行；执行前请备份。

BEGIN;

DELETE FROM "OrderItems";
DELETE FROM "Orders";
DELETE FROM "Users";

COMMIT;
