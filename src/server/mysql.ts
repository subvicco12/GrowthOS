import 'server-only';
import mysql, { type Pool } from 'mysql2/promise';

let pool: Pool | undefined;

/** Never expose credentials through NEXT_PUBLIC_ variables or browser bundles. */
export function getMySQLPool(): Pool {
  if (pool) return pool;
  const host = process.env.GROWTHOS_DB_HOST;
  const user = process.env.GROWTHOS_DB_USER;
  const password = process.env.GROWTHOS_DB_PASSWORD;
  const database = process.env.GROWTHOS_DB_NAME;
  if (!host || !user || !password || !database) throw new Error('DATABASE_NOT_CONFIGURED');
  pool = mysql.createPool({
    host, user, password, database,
    port: Number(process.env.GROWTHOS_DB_PORT || '3306'),
    waitForConnections: true, connectionLimit: 5, queueLimit: 20,
    timezone: 'Z', decimalNumbers: false, multipleStatements: false,
    connectTimeout: 10000
  });
  return pool;
}
