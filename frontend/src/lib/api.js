import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

export const apiClient = axios.create({
  baseURL: API,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("pos_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const detail = err.response?.data?.detail;
    if (Array.isArray(detail)) {
      err.response.data.detail = detail
        .map((d) => (d?.type === "greater_than" || d?.type === "greater_than_equal" ? "Informe um valor maior que zero" : d?.msg || "Dados inválidos"))
        .filter((m, i, a) => a.indexOf(m) === i)
        .join("; ");
    } else if (detail && typeof detail !== "string") {
      err.response.data.detail = "Dados inválidos";
    }
    if (err.response?.status === 401) {
      localStorage.removeItem("pos_token");
      localStorage.removeItem("pos_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const money = (n) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const formatDateOnly = (iso) => {
  if (!iso) return "-";
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
};
