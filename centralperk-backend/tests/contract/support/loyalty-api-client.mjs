function buildJsonRequest(method, body) {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = json?.error?.message || json?.message || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return json;
}

export class LoyaltyApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async awardPoints(payload) {
    const response = await fetch(`${this.baseUrl}/api/points/award`, buildJsonRequest("POST", payload));
    return parseJsonResponse(response);
  }

  async redeemPoints(payload) {
    const response = await fetch(`${this.baseUrl}/api/points/redeem`, buildJsonRequest("POST", payload));
    return parseJsonResponse(response);
  }

  async resolvePurchaseCampaigns(payload) {
    const response = await fetch(
      `${this.baseUrl}/api/campaigns/resolve-purchase`,
      buildJsonRequest("POST", payload)
    );
    return parseJsonResponse(response);
  }

  async claimFlashSale(payload) {
    const response = await fetch(
      `${this.baseUrl}/api/campaigns/flash-sale/claim`,
      buildJsonRequest("POST", payload)
    );
    return parseJsonResponse(response);
  }
}
