import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 80,
  duration: "30s",
};

const BASE = __ENV.GATEWAY_URL || "http://127.0.0.1:4000";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { "status 200": (r) => r.status === 200 });
}
