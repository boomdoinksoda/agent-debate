import * as lancedb from "@lancedb/lancedb";
import { resolve } from "path";
import { generateEmbedding } from "./embeddings.js";

const DB_DIR = ".agent-debate-db";

export interface VectorRecord {
  id: string;
  collection: string;
  text: string;
  metadata: string; // JSON-encoded metadata
  vector: number[];
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  score: number;
}

let dbInstance: lancedb.Connection | null = null;

async function getDb(projectRoot: string): Promise<lancedb.Connection> {
  if (!dbInstance) {
    const dbPath = resolve(projectRoot, DB_DIR);
    dbInstance = await lancedb.connect(dbPath);
  }
  return dbInstance;
}

function toRecords(items: VectorRecord[]): Record<string, unknown>[] {
  return items.map((item) => ({ ...item } as Record<string, unknown>));
}

async function getOrCreateTable(
  db: lancedb.Connection,
  tableName: string,
  records?: VectorRecord[]
): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();

  if (tableNames.includes(tableName)) {
    return db.openTable(tableName);
  }

  if (records && records.length > 0) {
    return db.createTable(tableName, toRecords(records));
  }

  // Create with a dummy record, then delete it
  const dummy: VectorRecord = {
    id: "__init__",
    collection: tableName,
    text: "",
    metadata: "{}",
    vector: new Array(256).fill(0) as number[],
  };
  const table = await db.createTable(tableName, toRecords([dummy]));
  await table.delete('id = "__init__"');
  return table;
}

/**
 * Add records to a collection (table) in the vector store.
 */
export async function addToStore(
  projectRoot: string,
  collection: string,
  items: { id: string; text: string; metadata?: Record<string, unknown> }[]
): Promise<void> {
  const db = await getDb(projectRoot);

  const records: VectorRecord[] = [];
  for (const item of items) {
    const vector = await generateEmbedding(item.text);
    records.push({
      id: item.id,
      collection,
      text: item.text,
      metadata: JSON.stringify(item.metadata ?? {}),
      vector,
    });
  }

  const table = await getOrCreateTable(db, collection, records);

  // If table already existed (not just created with our records), add to it
  const tableNames = await db.tableNames();
  if (tableNames.includes(collection)) {
    await table.add(toRecords(records));
  }
}

/**
 * Semantic search across a collection.
 */
export async function searchStore(
  projectRoot: string,
  collection: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  const db = await getDb(projectRoot);

  const tableNames = await db.tableNames();
  if (!tableNames.includes(collection)) {
    return [];
  }

  const table = await db.openTable(collection);
  const queryVector = await generateEmbedding(query);

  const results = await table.search(queryVector).limit(limit).toArray();

  return results.map((r) => ({
    id: r.id as string,
    text: r.text as string,
    metadata: JSON.parse((r.metadata as string) || "{}") as Record<
      string,
      unknown
    >,
    score: r._distance as number,
  }));
}

/**
 * List all collections in the store.
 */
export async function listCollections(
  projectRoot: string
): Promise<string[]> {
  const db = await getDb(projectRoot);
  return db.tableNames();
}

/**
 * Delete a collection.
 */
export async function deleteCollection(
  projectRoot: string,
  collection: string
): Promise<void> {
  const db = await getDb(projectRoot);
  await db.dropTable(collection);
}
