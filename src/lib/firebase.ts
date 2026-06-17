import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  writeBatch as fbWriteBatch
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  doc, 
  collection, 
  query, 
  where, 
  orderBy, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged
};

export function writeBatch(dbInstance: any) {
  return fbWriteBatch(dbInstance);
}

export type ModeType = "sandbox" | "live";
let currentMode: ModeType = "live";
export function getSystemMode(): ModeType { return currentMode; }
export function setSystemMode(mode: ModeType) { currentMode = mode; }
export function onSystemModeChange(cb: (mode: ModeType) => void) { return () => {}; }

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
}
