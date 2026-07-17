import { prisma } from "../db/prisma.js";
import { writeActivityLog } from "./activityLogService.js";

type RemoveAgentResult = {
  agentId: string;
  agentName: string;
  deletedAgent: boolean;
};

export async function removeAgentForUser(input: { userId: string; agentId: string }): Promise<RemoveAgentResult | null> {
  const result = await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({
      where: { id: input.agentId, connections: { some: { userId: input.userId } } },
      select: { id: true, name: true }
    });
    if (!agent) return null;

    await tx.agentPermission.deleteMany({ where: { userId: input.userId, agentId: agent.id } });
    await tx.hitlRequest.deleteMany({ where: { userId: input.userId, agentId: agent.id, status: "pending_human_approval" } });
    await tx.userAgentInstall.deleteMany({ where: { userId: input.userId, agentId: agent.id } });
    await tx.agentConversation.deleteMany({ where: { userId: input.userId, agentId: agent.id } });
    await tx.userConnection.deleteMany({ where: { userId: input.userId, agentId: agent.id } });

    const remainingConnections = await tx.userConnection.count({ where: { agentId: agent.id } });
    const deletedAgent = remainingConnections === 0;
    if (deletedAgent) {
      await tx.agent.delete({ where: { id: agent.id } });
    }

    return {
      agentId: agent.id,
      agentName: agent.name,
      deletedAgent
    };
  });

  if (!result) return null;

  await writeActivityLog({
    userId: input.userId,
    agentId: result.deletedAgent ? null : result.agentId,
    actionType: "agent_removed",
    status: "success",
    dataAccessed: result.agentName,
    dynamicMetadata: {
      source: "agent_runtime",
      eventCategory: "agent_management",
      userTitle: "Agent removed",
      userSummary: `${result.agentName} was removed from your profile.`,
      statusLabel: "Done",
      userManaged: true,
      removedAgentId: result.agentId,
      deletedAgent: result.deletedAgent,
      nextStep: "Add it again from Agent Pool if you need it later."
    }
  });

  return result;
}
