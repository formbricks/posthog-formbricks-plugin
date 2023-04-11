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

export async function runEveryMinute({ cache, storage, global, config }) {
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
    /* const userRes = await posthog.api.get("/api/projects/@current/persons", {
      host: global.posthogUrl,
      personalApiKey: global.posthogApiKey,
      projectApiKey: global.posthogProjectKey,
    }); */
    const userRes = await posthog.api.get("/api/projects/@current/persons");
    const userResponse = await userRes.json();

    const users: FormbricksUser[] = [];

    console.log("userResponse", userResponse);

    if (userResponse.results && userResponse.results.length > 0) {
      for (const loadedUser of userResponse["results"]) {
        for (const distinctId of loadedUser["distinct_ids"]) {
          console.log("pushing user", distinctId);
          users.push({
            userId: distinctId,
            attributes: loadedUser["properties"],
          });
        }
      }
    }
    console.log("users", users);
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
