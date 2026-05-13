export async function emitBudgetExhaustedEvent(payload) {
    const endpoint = process.env.CAMPAIGN_EVENTS_URL || process.env.EVENTS_URL || "";
    const event = {
        eventType: "campaign.budget.exhausted",
        emittedAt: new Date().toISOString(),
        payload,
    };
    if (!endpoint) {
        console.log(JSON.stringify(event));
        return { eventType: event.eventType, emittedAt: event.emittedAt, delivered: false };
    }
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
        });
        return {
            eventType: event.eventType,
            emittedAt: event.emittedAt,
            delivered: response.ok,
            endpoint,
            error: response.ok ? undefined : `HTTP ${response.status}`,
        };
    }
    catch (error) {
        return {
            eventType: event.eventType,
            emittedAt: event.emittedAt,
            delivered: false,
            endpoint,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
