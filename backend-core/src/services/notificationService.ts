import type { Agent, HitlRequest, User } from "@prisma/client";
import { env, frontendOrigins } from "../config/env.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/prisma.js";

type ApprovalNotificationInput = HitlRequest & {
  agent: Agent;
  user: User;
};

type NotificationResult = {
  status: "sent" | "skipped" | "failed";
  notificationId: string;
  provider?: string;
  providerId?: string;
  reason?: string;
};

function friendlyActionName(actionName: string) {
  return actionName.replace(/_/g, " ");
}

function approvalUrl() {
  const baseUrl = env.APP_PUBLIC_URL ?? frontendOrigins[0] ?? "http://localhost:5173";
  return `${baseUrl.replace(/\/$/, "")}/#approvals`;
}

function renderApprovalEmail(input: ApprovalNotificationInput) {
  const actionName = friendlyActionName(input.actionName);
  const url = approvalUrl();
  const subject = `${input.agent.name} needs your approval`;
  const text = [
    `${input.agent.name} needs your approval in AI Agent Hub.`,
    "",
    `Action: ${actionName}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "",
    `Open approval page: ${url}`,
    "",
    "If you do not approve it, the action stays paused."
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.5;">
      <h1 style="font-size: 22px; margin: 0 0 12px;">${input.agent.name} needs your approval</h1>
      <p style="margin: 0 0 12px;">A connected AI helper paused before continuing an important action.</p>
      <p style="margin: 0 0 12px;"><strong>Action:</strong> ${actionName}</p>
      <p style="margin: 0 0 20px;"><strong>Expires:</strong> ${input.expiresAt.toISOString()}</p>
      <a href="${url}" style="display: inline-block; background: #163556; color: #ffffff; padding: 12px 16px; border-radius: 8px; text-decoration: none; font-weight: 700;">Open approval page</a>
      <p style="margin: 20px 0 0; color: #5d6b7d;">If you do not approve it, the action stays paused.</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendApprovalNotification(input: ApprovalNotificationInput): Promise<NotificationResult> {
  const email = renderApprovalEmail(input);
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      hitlRequestId: input.id,
      channel: "email",
      status: "pending",
      subject: email.subject,
      provider: "resend"
    }
  });

  if (!env.RESEND_API_KEY) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "skipped",
        errorMessage: "RESEND_API_KEY is not configured"
      }
    });
    return {
      status: "skipped",
      notificationId: notification.id,
      provider: "resend",
      reason: "RESEND_API_KEY is not configured"
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.NOTIFICATION_FROM_EMAIL,
        to: input.user.email,
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
    if (!response.ok) {
      throw new Error(body.message ?? body.error ?? `Resend returned ${response.status}`);
    }
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "sent",
        providerId: body.id ?? null,
        sentAt: new Date()
      }
    });
    return {
      status: "sent",
      notificationId: notification.id,
      provider: "resend",
      providerId: body.id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    logger.warn({ err: error, notificationId: notification.id }, "Approval notification email failed");
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "failed",
        errorMessage: message
      }
    });
    return {
      status: "failed",
      notificationId: notification.id,
      provider: "resend",
      reason: message
    };
  }
}
