
interface UserAuth {
  userId: string;
  name: string;
  role: 'doctor' | 'patient';
  token: string;
}

const STORAGE_KEY = 'healthgit_auth';

export const auth = {
  saveUser(user: UserAuth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  },
  
  getUser(): UserAuth | null {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },
  
  logout() {
    localStorage.removeItem(STORAGE_KEY);
  },
  
  getAuthHeader() {
    const user = this.getUser();
    return user?.token ? { 'Authorization': `Bearer ${user.token}` } : {};
  }
};
