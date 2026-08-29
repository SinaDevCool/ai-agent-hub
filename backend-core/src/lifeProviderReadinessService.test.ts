import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "./db/prisma.js";
import { listLifeProviderReadiness } from "./services/lifeProviderReadinessService.js";

test("readiness reports native sandboxes as ready and external providers as honestly gated", async () => {
  const userId = `readiness-${Date.now()}`;
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" } });
  const readiness = await listLifeProviderReadiness(userId);
  for (const providerId of ["life-sandbox", "finance-sandbox"]) {
    const provider = readiness.find((item) => item.providerId === providerId);
    assert.equal(provider?.state, "ready");
    assert.equal(provider?.executable, true);
    assert.equal(provider?.adapterStatus, "native");
  }
  const booking = readiness.find((item) => item.providerId === "booking-demand");
  assert.equal(booking?.executable, false);
  assert.match(booking?.nextStep ?? "", /partner approval/i);
  const trueLayer = readiness.find((item) => item.providerId === "truelayer");
  assert.equal(trueLayer?.executable, false);
  assert.match(trueLayer?.nextStep ?? "", /regulated\/commercial onboarding/i);
  await prisma.user.delete({ where: { id: userId } });
});
