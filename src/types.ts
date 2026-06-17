export interface Commit {
  hash: string;
  message: string;
  clinicalData: string;
  authorId: string;
  authorName: string;
  timestamp: string | number;
  attachments?: {
    name: string;
    size: string;
    type: string;
    url?: string;
  }[];
}

export interface Branch {
  id: string;
  patientId: string;
  doctorId: string;
  name: string;
  commits: Commit[];
  status: 'active' | 'merged';
  createdAt: string;
}

export interface Patient {
  id: string;
  name: string;
  email: string;
  dob: string;
  mainBranch: Commit[]; // The immutable timeline
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  specialty: string;
}

export interface AppState {
  currentUser: { id: string; role: 'doctor' | 'patient'; name: string } | null;
}
