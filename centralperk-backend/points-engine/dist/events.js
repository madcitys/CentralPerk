export async function emitPointsExpiryEvent(result) {
    const endpoint = process.env.POINTS_EVENTS_URL || process.env.EVENTS_URL || "";
    const event = {
        eventType: "points.expiry.completed",
        emittedAt: new Date().toISOString(),
        payload: {
            membersProcessed: result.membersProcessed,
            pointsExpired: result.pointsExpired,
        },
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
