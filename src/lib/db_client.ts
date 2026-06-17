import { auth as jwtAuth } from "./auth";

export type ModeType = "sandbox";

export function getSystemMode(): ModeType {
  return "sandbox";
}

export function onSystemModeChange(cb: (mode: ModeType) => void) {
  return () => {};
}

export function setSystemMode(mode: ModeType) {
  // Ignored
}

export class MockDocRef {
  constructor(public colPath: string, public docId: string) {}
}

export class MockCollectionRef {
  constructor(public colPath: string) {}
}

export class MockQuery {
  constructor(public colRef: MockCollectionRef, public constraints: any[]) {}
}

export class MockDocSnapshot {
  constructor(public id: string, private _data: any) {}
  exists() {
    return !!this._data;
  }
  data() {
    return this._data;
  }
}

export class MockQuerySnapshot {
  constructor(public docs: MockDocSnapshot[]) {}
}

export const db: any = {};

export function doc(dbOrRef: any, path: string, ...segments: string[]): any {
  let fullPath = "";
  if (dbOrRef instanceof MockCollectionRef) {
    fullPath = dbOrRef.colPath + "/" + path;
  } else if (dbOrRef instanceof MockDocRef) {
    fullPath = dbOrRef.colPath + "/" + dbOrRef.docId + "/" + path;
  } else {
    fullPath = path;
  }
  
  if (segments.length > 0) {
    fullPath += "/" + segments.join("/");
  }
  
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length % 2 === 0) {
    const docId = parts.pop() || "";
    const colPath = parts.join("/");
    return new MockDocRef(colPath, docId);
  } else {
    throw new Error("Invalid document path in Sandbox Mode: " + fullPath);
  }
}

export function collection(dbOrRef: any, path: string, ...segments: string[]): any {
  let fullPath = "";
  if (dbOrRef instanceof MockDocRef) {
    fullPath = dbOrRef.colPath + "/" + dbOrRef.docId + "/" + path;
  } else {
    fullPath = path;
  }
  if (segments.length > 0) {
    fullPath += "/" + segments.join("/");
  }
  return new MockCollectionRef(fullPath);
}

export function query(colRef: any, ...constraints: any[]): any {
  return new MockQuery(colRef, constraints);
}

export function where(field: string, op: string, value: any) {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, direction: string = "asc") {
  return { type: "orderBy", field, direction };
}

export function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    ...jwtAuth.getAuthHeader()
  };
}

export async function getDoc(docRef: any): Promise<any> {
  const colPath = docRef.colPath;
  const docId = docRef.docId;

  try {
    const res = await fetch("/api/mongodb/document", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ collectionPath: colPath, docId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.item) {
        return new MockDocSnapshot(docId, data.item);
      }
    }
  } catch(e) {
    console.error("Failed to fetch doc from MongoDB:", e);
  }
  return new MockDocSnapshot(docId, null);
}

export async function getDocs(queryOrRef: any): Promise<any> {
  let colPath = "";
  let constraints: any[] = [];
  
  if (queryOrRef instanceof MockCollectionRef) {
    colPath = queryOrRef.colPath;
  } else if (queryOrRef instanceof MockQuery) {
    colPath = queryOrRef.colRef.colPath;
    constraints = queryOrRef.constraints;
  }

  // Convert constraints array to MongoDB style query object
  let queryParams: any = {};
  for (const c of constraints) {
    if (c?.type === "where") {
      if (c.op === "==") queryParams[c.field] = c.value;
      if (c.op === "!=") queryParams[c.field] = { $ne: c.value };
    }
  }

  try {
    const res = await fetch("/api/mongodb/query", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ collectionPath: colPath, queryParams })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.items) {
        const sortedItems = data.items;
        
        // Handle sorting if there is an orderBy clause
        const orderClause = constraints.find(c => c?.type === "orderBy");
        if (orderClause) {
           sortedItems.sort((a: any, b: any) => {
             const valA = a[orderClause.field];
             const valB = b[orderClause.field];
             if (valA < valB) return orderClause.direction === "asc" ? -1 : 1;
             if (valA > valB) return orderClause.direction === "asc" ? 1 : -1;
             return 0;
           });
        }
        
        return new MockQuerySnapshot(sortedItems.map((item: any) => 
           new MockDocSnapshot(item._id || item.userId || item.id, item)
        ));
      }
    }
  } catch(e) {
    console.error("Failed to query docs from MongoDB:", e);
  }
  
  return new MockQuerySnapshot([]);
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  const colPath = docRef.colPath;
  const docId = docRef.docId;

  try {
    await fetch("/api/mongodb/set-document", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        collectionPath: colPath,
        docId,
        data,
        merge: options?.merge === true
      })
    });
  } catch (err) {
    console.error("Failed to set doc to MongoDB:", err);
  }
}

export async function addDoc(colRef: any, data: any): Promise<any> {
  const docId = Math.random().toString(36).substring(2, 12);
  await setDoc(doc(db, colRef.colPath, docId), data);
  return { id: docId };
}

export function writeBatch(dbInstance: any): any {
  const operations: Array<() => Promise<void>> = [];
  
  return {
    set(docRef: any, data: any, options?: any) {
      operations.push(async () => {
        await setDoc(docRef, data, options);
      });
    },
    update(docRef: any, data: any) {
      operations.push(async () => {
        await setDoc(docRef, data, { merge: true });
      });
    },
    async commit() {
      for (const op of operations) {
        await op();
      }
    }
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DbErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleDbError(error: unknown, operationType: OperationType, path: string | null): never {
  const errObject = {
    error: error instanceof Error ? error.message : String(error),
    source: "MongoDB/JSON Fallback Client",
    operationType,
    path
  };
  const errString = JSON.stringify(errObject);
  console.error('[Database Request Error]: ', errString);
  throw new Error(errString);
}
