import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";

// Path for the local file fallback Database
const FALLBACK_DB_PATH = path.join(process.cwd(), "mongodb_fallback.json");

// Helper to initialize or load the fallback database
function loadFallbackDb(): Record<string, any[]> {
  try {
    if (!fs.existsSync(FALLBACK_DB_PATH)) {
      // Add some initial seed users matching RoleSelector demo accounts so the user has offline-ready data
      const initialDb = {
        users: [
          {
            userId: "dr-gregory-ross-id",
            name: "Dr. Gregory Ross",
            email: "dr.ross@healthgit.com",
            password: "$2a$10$8K07.LpLgVIsfshYfF7DPOY6r4H8Z8K.4rXbYxID/C3Q1667r9Cne",
            role: "doctor",
            specialty: "Cardiology",
            createdAt: new Date().toISOString()
          },
          {
            userId: "dr-helen-vance-id",
            name: "Dr. Helen Vance",
            email: "helen.vance@healthgit.com",
            password: "$2a$10$8K07.LpLgVIsfshYfF7DPOY6r4H8Z8K.4rXbYxID/C3Q1667r9Cne",
            role: "doctor",
            specialty: "Pediatrics",
            createdAt: new Date().toISOString()
          },
          {
            userId: "alice-baker-id",
            name: "Alice Baker",
            email: "alice.baker@healthgit.com",
            password: "$2a$10$8K07.LpLgVIsfshYfF7DPOY6r4H8Z8K.4rXbYxID/C3Q1667r9Cne",
            role: "patient",
            dob: "1988-10-24",
            createdAt: new Date().toISOString()
          },
          {
            userId: "marcus-campbell-id",
            name: "Marcus Campbell",
            email: "marcus.campbell@healthgit.com",
            password: "$2a$10$8K07.LpLgVIsfshYfF7DPOY6r4H8Z8K.4rXbYxID/C3Q1667r9Cne",
            role: "patient",
            dob: "1992-08-14",
            createdAt: new Date().toISOString()
          }
        ]
      };
      fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(initialDb, null, 2), "utf-8");
      return initialDb;
    }
    const content = fs.readFileSync(FALLBACK_DB_PATH, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[MongoDB Fallback] Failed to load JSON fallback DB:", err);
    return { users: [] };
  }
}

// Helper to save the fallback database to disk
function saveFallbackDb(data: Record<string, any[]>) {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[MongoDB Fallback] Failed to save JSON fallback DB to disk:", err);
  }
}

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

let initializationPromise: Promise<any> | null = null;
let cachedDb: any = null;

export async function getMongoDb() {
  if (cachedDb) return cachedDb;

  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (!mongoUri || mongoUri === "MY_MONGODB_URI") {
      console.log("[MongoDB] No valid URI found. Using local fallback.");
      const fallback = createFallbackDb();
      cachedDb = fallback;
      return fallback;
    }

    try {
      console.log("[MongoDB] Connecting to remote cluster...");
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const dbName = mongoUri.split("/").pop()?.split("?")[0] || "healthgit_db";
      const remoteDb = client.db(dbName);
      
      console.log(`[MongoDB] Connected to database: ${dbName}`);

      const proxy = {
        isFallback: false,
        collection: (name: string) => {
          const col = remoteDb.collection(name);
          return {
            findOne: (q: any) => col.findOne(q),
            find: (q: any) => ({
              toArray: () => col.find(q).toArray()
            }),
            insertOne: (d: any) => col.insertOne(d),
            updateOne: (q: any, u: any, o?: any) => col.updateOne(q, u, o || { upsert: true }),
            deleteOne: (q: any) => col.deleteOne(q)
          };
        }
      };

      cachedDb = proxy;
      return proxy;
    } catch (err: any) {
      console.error(`[MongoDB] Connection failed: ${err.message}. Switching to local fallback.`);
      const fallback = createFallbackDb();
      // Cache the fallback so we don't keep trying the broken URI
      cachedDb = fallback;
      return fallback;
    }
  })();

  return initializationPromise;
}

function createFallbackDb() {
  return {
    isFallback: true,
    collection: (colName: string) => {
      return {
        findOne: async (query: any) => {
          const dbData = loadFallbackDb();
          const colList = dbData[colName] || [];
          return colList.find(item => {
            return Object.entries(query).every(([k, v]) => String(item[k]) === String(v));
          }) || null;
        },
        find: (query: any) => {
          return {
            toArray: async () => {
              const dbData = loadFallbackDb();
              const colList = dbData[colName] || [];
              return colList.filter(item => {
                return Object.entries(query).every(([k, v]) => String(item[k]) === String(v));
              });
            }
          };
        },
        insertOne: async (doc: any) => {
          const dbData = loadFallbackDb();
          if (!dbData[colName]) dbData[colName] = [];
          const newDocId = doc._id || doc.userId || String(Math.random());
          const enrichedDoc = { ...doc, _id: newDocId };
          dbData[colName].push(enrichedDoc);
          saveFallbackDb(dbData);
          return { acknowledged: true, insertedId: enrichedDoc._id };
        },
        updateOne: async (query: any, update: any, options?: any) => {
          const dbData = loadFallbackDb();
          if (!dbData[colName]) dbData[colName] = [];
          
          let itemIdx = dbData[colName].findIndex(item => {
            return Object.entries(query).every(([k, v]) => String(item[k]) === String(v));
          });

          const setFields = update.$set || update;

          if (itemIdx === -1) {
            if (options?.upsert !== false) {
              const newDocId = setFields._id || query._id || query.userId || String(Math.random());
              const newDoc = { ...query, ...setFields, _id: newDocId };
              dbData[colName].push(newDoc);
              saveFallbackDb(dbData);
              return { acknowledged: true, upsertedCount: 1, upsertedId: newDoc._id };
            }
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
          }

          dbData[colName][itemIdx] = { ...dbData[colName][itemIdx], ...setFields };
          saveFallbackDb(dbData);
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
        },
        deleteOne: async (query: any) => {
          const dbData = loadFallbackDb();
          const colList = dbData[colName] || [];
          const initialLen = colList.length;
          const filtered = colList.filter(item => {
            return !Object.entries(query).every(([k, v]) => String(item[k]) === String(v));
          });
          dbData[colName] = filtered;
          saveFallbackDb(dbData);
          return { acknowledged: true, deletedCount: initialLen - filtered.length };
        }
      };
    }
  };
}
