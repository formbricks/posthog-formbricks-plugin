interface FormbricksUser {
  userId: string;
  attributes: { [key: string]: any };
}

export async function setupPlugin({ storage, config, global }) {
  if (!config.formbricksHost) {
    throw new Error("Please set the 'formbricksHost' config value");
  }
  if (!config.environmentId) {
    throw new Error("Please set the 'environmentId' config value");
  }
  if (!config.apiKey) {
    throw new Error("Please set the 'apiKey' config values");
  }

  const resetStorage = config.resetStorage === "Yes";

  if (resetStorage) {
    await storage.del("formbricks-lastSyncedAt");
  }
}

export async function runEveryHour({ cache, storage, global, config }) {
  let lastSyncedAt = await storage.get("formbricks-lastSyncedAt", null);
  if (config.import === "Yes") {
    const response = await fetch(
      `${config.formbricksHost}/api/v1/environments/${config.environmentId}/posthog/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify({ lastSyncedAt }),
      }
    );

    const result = await response.json();

    for (const event of result.events) {
      posthog.capture(event.name, {
        timestamp: event.timestamp,
        userId: event.userId,
      });
    }
  }
  if (config.export === "Yes") {
    const userRes = await posthog.api.get("/api/projects/@current/persons", {
      host: config.posthogHost,
    });
    const userResponse = await userRes.json();

    const users: FormbricksUser[] = [];

    if (userResponse.results && userResponse.results.length > 0) {
      for (const loadedUser of userResponse["results"]) {
        // Filter out $ properties
        const customAttributes = (
          obj: Record<string, any>
        ): Record<string, any> => {
          return Object.fromEntries(
            Object.entries(loadedUser["properties"]).filter(
              ([key]) => !key.startsWith("$")
            )
          );
        };
        // Add each distinct_id as a user
        for (const distinctId of loadedUser["distinct_ids"]) {
          users.push({
            userId: distinctId,
            attributes: customAttributes,
          });
        }
      }
    }

    await fetch(
      `${config.formbricksHost}/api/v1/environments/${config.environmentId}/posthog/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify({ users }),
      }
    );
  }
  await storage.set("formbricks-lastSyncedAt", new Date().toISOString());
}
