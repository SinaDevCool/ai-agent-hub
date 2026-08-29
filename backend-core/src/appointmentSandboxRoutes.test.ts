import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { resetAppointmentCalendarCreateForTest, setAppointmentCalendarCreateForTest } from "./services/appointmentSandboxService.js";

const runId = `appointment-routes-${Date.now()}`;
const userId = `${runId}-owner`;
const outsiderId = `${runId}-outsider`;
let server: Server;
let baseUrl = "";
async function request(path: string, actingUser: string, method = "POST", body?: unknown) {
  return fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json", "x-user-id": actingUser }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}

before(async () => {
  await prisma.user.createMany({ data: [userId, outsiderId].map((id) => ({ id, email: `${id}@example.test`, vaultLocalPath: "", vaultEncryptionSalt: "test" })) });
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  resetAppointmentCalendarCreateForTest();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } });
});

test("appointment HTTP flow searches, books idempotently, reschedules, syncs, cancels, and isolates users", async () => {
  const search = await request("/api/life-platform/appointments/sandbox/search", userId, "POST", { specialty: "Dentist", location: "Berlin", date: "2030-04-12", timeZone: "Europe/Berlin" });
  assert.equal(search.status, 200);
  const slots = ((await search.json()) as { slots: unknown[] }).slots;
  assert.equal(slots.length, 3);

  const bookingBody = { slot: slots[0], confirmed: true, idempotencyKey: `${runId}-book` };
  const booked = await request("/api/life-platform/appointments/sandbox/book", userId, "POST", bookingBody);
  assert.equal(booked.status, 201);
  const appointment = ((await booked.json()) as { appointment: { id: string; status: string } }).appointment;
  assert.equal(appointment.status, "confirmed");
  const replay = await request("/api/life-platform/appointments/sandbox/book", userId, "POST", bookingBody);
  assert.equal(((await replay.json()) as { appointment: { id: string } }).appointment.id, appointment.id);

  assert.equal((await request(`/api/life-platform/appointments/sandbox/${appointment.id}/cancel`, outsiderId, "POST", { confirmed: true })).status, 400);
  const rescheduled = await request(`/api/life-platform/appointments/sandbox/${appointment.id}/reschedule`, userId, "POST", { slot: slots[1], confirmed: true });
  assert.equal(rescheduled.status, 200);
  assert.equal(((await rescheduled.json()) as { appointment: { startsAt: string } }).appointment.startsAt, (slots[1] as { startsAt: string }).startsAt);

  setAppointmentCalendarCreateForTest(async () => ({ status: "ok", eventId: "appt-event", eventUrl: "https://calendar.test/appt-event", eventStatus: "confirmed" }));
  assert.equal((await request(`/api/life-platform/appointments/sandbox/${appointment.id}/calendar`, userId)).status, 200);
  assert.equal((await request(`/api/life-platform/appointments/sandbox/${appointment.id}/calendar`, userId)).status, 200);
  const listed = await request("/api/life-platform/appointments", userId, "GET");
  assert.equal(((await listed.json()) as { appointments: unknown[] }).appointments.length, 1);
  const outsiderList = await request("/api/life-platform/appointments", outsiderId, "GET");
  assert.equal(((await outsiderList.json()) as { appointments: unknown[] }).appointments.length, 0);

  const cancelled = await request(`/api/life-platform/appointments/sandbox/${appointment.id}/cancel`, userId, "POST", { confirmed: true });
  assert.equal(((await cancelled.json()) as { appointment: { status: string } }).appointment.status, "cancelled");
});

test("appointment mutations require explicit confirmation", async () => {
  const slots = ((await (await request("/api/life-platform/appointments/sandbox/search", userId, "POST", { specialty: "GP", location: "Berlin", date: "2030-04-13" })).json()) as { slots: unknown[] }).slots;
  assert.equal((await request("/api/life-platform/appointments/sandbox/book", userId, "POST", { slot: slots[0], idempotencyKey: `${runId}-unconfirmed` })).status, 400);
});
