import assert from "node:assert/strict";
import { after, test } from "node:test";

const { prisma } = await import("./db/prisma.js");
const { ensureUserWorkspace } = await import("./services/workspaceService.js");

const testRunId = `workspace-${Date.now()}`;

after(async () => {
  await prisma.activityLog.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.agentPermission.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.hitlRequest.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userAgentInstall.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.userConnection.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.vaultDocument.deleteMany({ where: { userId: { startsWith: testRunId } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: testRunId } } });
  await prisma.$disconnect();
});

test("new workspaces start clean without seeded personal helpers, private notes, or activity", async () => {
  const user = await ensureUserWorkspace({
    id: `${testRunId}-clean-user`,
    email: `${testRunId}-clean-user@example.test`
  });

  const [connections, installs, documents, logs] = await Promise.all([
    prisma.userConnection.count({ where: { userId: user.id } }),
    prisma.userAgentInstall.count({ where: { userId: user.id } }),
    prisma.vaultDocument.count({ where: { userId: user.id } }),
    prisma.activityLog.count({ where: { userId: user.id } })
  ]);

  assert.equal(connections, 0);
  assert.equal(installs, 0);
  assert.equal(documents, 0);
  assert.equal(logs, 0);
});
