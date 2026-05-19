import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 80,
  duration: "30s",
};

const BASE = __ENV.SCM_GATEWAY_URL || "http://localhost:3011";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { "status 200": (r) => r.status === 200 });
}
