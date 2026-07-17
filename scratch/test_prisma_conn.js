import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// 加載環境變數
dotenv.config({ path: path.resolve('/Users/mac/Desktop/G/inventory-system/.env') });

const testConnection = async (url) => {
    console.log(`\n測試連接: ${url.replace(/:[^:@]+@/, ':***@')}`);
    
    // 手動重寫環境變數
    process.env.DATABASE_URL = url;
    
    // 初始化新的 PrismaClient
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: url
            }
        }
    });

    try {
        const start = Date.now();
        // 執行一個簡單查詢
        const result = await prisma.$queryRaw`SELECT 1 as result`;
        console.log(`✅ 連接成功！結果:`, result, `耗時: ${Date.now() - start}ms`);
        return true;
    } catch (err) {
        console.error(`❌ 連接失敗！錯誤訊息:`, err.message);
        return false;
    } finally {
        await prisma.$disconnect();
    }
};

const main = async () => {
    const originalUrl = "postgresql://postgres.gsoebguhxkwqesdybjpj:h7832595126H@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
    
    // 測試 1: 原本的 URL 加上 ?sslaccept=accept_invalid_certs
    const url1 = `${originalUrl}?sslaccept=accept_invalid_certs`;
    const res1 = await testConnection(url1);
    
    // 測試 2: 加上 ?sslmode=disable
    const url2 = `${originalUrl}?sslmode=disable`;
    const res2 = await testConnection(url2);
    
    // 測試 3: 加上 ?sslmode=prefer
    const url3 = `${originalUrl}?sslmode=prefer`;
    const res3 = await testConnection(url3);
};

main();
