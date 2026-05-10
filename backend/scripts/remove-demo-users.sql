-- 一次性清理旧版启动 Seed 留下的演示账号（当前代码已不再写入这些用户）。
-- PostgreSQL：先删订单明细与订单，再删用户，避免外键错误。
-- 执行前请备份；确认邮箱列表符合你的环境后再运行。

BEGIN;

DELETE FROM "OrderItems"
WHERE "OrderId" IN (
    SELECT o."Id"
    FROM "Orders" o
    INNER JOIN "Users" u ON o."UserId" = u."Id"
    WHERE u."Email" IN (
        'admin@iga.local',
        'staff@iga.local',
        'guest@iga.local',
        'alice@test.com',
        'bob@test.com',
        'carol@test.com'
    )
);

DELETE FROM "Orders"
WHERE "UserId" IN (
    SELECT "Id"
    FROM "Users"
    WHERE "Email" IN (
        'admin@iga.local',
        'staff@iga.local',
        'guest@iga.local',
        'alice@test.com',
        'bob@test.com',
        'carol@test.com'
    )
);

DELETE FROM "Users"
WHERE "Email" IN (
    'admin@iga.local',
    'staff@iga.local',
    'guest@iga.local',
    'alice@test.com',
    'bob@test.com',
    'carol@test.com'
);

COMMIT;
