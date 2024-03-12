import { nanoid } from "@dub/utils";
import mysql, { OkPacket, ResultSetHeader } from 'mysql2/promise';
import { FieldPacket, RowDataPacket } from 'mysql2/promise';
import { DomainProps, ProjectProps, LinkProps } from "./types";

const DATABASE_URL = process.env.PLANETSCALE_DATABASE_URL || process.env.DATABASE_URL;
const dbConfig = DATABASE_URL ? new URL(DATABASE_URL) : null;

const pool = mysql.createPool({
  host: dbConfig?.hostname,
  user: dbConfig?.username,
  password: dbConfig?.password,
  database: dbConfig?.pathname?.replace(/^\//, ''), // Remove the leading slash
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

type QueryResult = RowDataPacket[] | RowDataPacket[][] | OkPacket | OkPacket[] | ResultSetHeader;


async function executeQuery<T>(query: string, params: Array<string | number>): Promise<T[] | null> {
  if (!DATABASE_URL) return null;

  const [rows]: [QueryResult, FieldPacket[]] = await pool.execute(query, params);

  return (rows as RowDataPacket[]) as T[];
}

export const getProjectViaEdge = async (projectId: string): Promise<ProjectProps | null> => {
  const rows = await executeQuery<ProjectProps>("SELECT * FROM Project WHERE id = ?", [projectId]);
  return rows && rows.length > 0 ? rows[0] : null;
};

export const getDomainViaEdge = async (domain: string): Promise<DomainProps | null> => {
  const rows = await executeQuery<DomainProps>("SELECT * FROM Domain WHERE slug = ?", [domain]);
  return rows && rows.length > 0 ? rows[0] : null;
};

async function checkIfKeyExists(domain: string, key: string): Promise<boolean> {
  const query = "SELECT 1 FROM Link WHERE domain = ? AND `key` = ? LIMIT 1";
  const [rows]: [RowDataPacket[], FieldPacket[]] = await pool.execute(query, [domain, decodeURIComponent(key)]);
  return rows.length > 0;
}

export const getLinkViaEdge = async (domain: string, key: string): Promise<LinkProps | null> => {
  const rows = await executeQuery<LinkProps>("SELECT * FROM Link WHERE domain = ? AND `key` = ?", [domain, decodeURIComponent(key)]);
  return rows && rows.length > 0 ? rows[0] : null;
};

// The other functions like getDomainOrLink and getRandomKey can remain largely unchanged.


export async function getDomainOrLink({
  domain,
  key,
}: {
  domain: string;
  key?: string;
}) {
  if (!key || key === "_root") {
    const data = await getDomainViaEdge(domain);
    if (!data) return null;
    return {
      ...data,
      key: "_root",
      url: data?.target,
    };
  } else {
    return await getLinkViaEdge(domain, key);
  }
}

export async function getRandomKey(
  domain: string,
  prefix?: string,
): Promise<string> {
  /* recursively get random key till it gets one that's available */
  let key = nanoid();
  if (prefix) {
    key = `${prefix.replace(/^\/|\/$/g, "")}/${key}`;
  }
  const exists = await checkIfKeyExists(domain, key);
  if (exists) {
    // by the off chance that key already exists
    return getRandomKey(domain, prefix);
  } else {
    return key;
  }
}
