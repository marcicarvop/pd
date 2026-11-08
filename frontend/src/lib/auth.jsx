import { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pos_token");
    const stored = localStorage.getItem("pos_user");
    if (token && stored) {
      setUser(JSON.parse(stored));
      // validate async
      apiClient.get("/auth/me").then(r => {
        setUser(r.data);
        localStorage.setItem("pos_user", JSON.stringify(r.data));
      }).catch(() => {
        localStorage.removeItem("pos_token");
        localStorage.removeItem("pos_user");
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (payload) => {
    const r = await apiClient.post("/auth/login", payload);
    localStorage.setItem("pos_token", r.data.access_token);
    localStorage.setItem("pos_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
