import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { badRequest } from "../errors/httpError.js";
import { decodeJson, encodeJson } from "./jsonService.js";
import { createGoogleCalendarEvent } from "./googleConnectorService.js";

export type SandboxAppointmentSlot = {
  id: string;
  externalProviderId: string;
  providerName: string;
  specialty: string;
  location: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  bookingMode: "sandbox";
};

type CalendarCreate = typeof createGoogleCalendarEvent;
let createCalendarEvent: CalendarCreate = createGoogleCalendarEvent;
export function setAppointmentCalendarCreateForTest(value: CalendarCreate) { createCalendarEvent = value; }
export function resetAppointmentCalendarCreateForTest() { createCalendarEvent = createGoogleCalendarEvent; }

function requiredText(value: unknown, label: string, max = 120) {
  const text = String(value ?? "").trim();
  if (!text) throw badRequest(`${label} is required.`);
  if (text.length > max) throw badRequest(`${label} is too long.`);
  return text;
}

function cleanDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw badRequest("Appointment date must use YYYY-MM-DD.");
  return date;
}

function serializeAppointment(value: Awaited<ReturnType<typeof prisma.appointment.findFirst>> & {}) {
  return { ...value, calendarEvent: decodeJson<Record<string, unknown>>(value.calendarEventJson, {}), calendarEventJson: undefined };
}

export function searchSandboxAppointments(input: { specialty?: unknown; location?: unknown; date?: unknown; timeZone?: unknown }) {
  const specialty = requiredText(input.specialty, "Specialty");
  const location = requiredText(input.location, "Location");
  const date = cleanDate(input.date);
  const timeZone = requiredText(input.timeZone ?? "Europe/Berlin", "Time zone", 80);
  const seed = createHash("sha256").update(`${specialty}|${location}|${date}`).digest("hex").slice(0, 8);
  const providers = ["Sandbox Health Centre", "Example Medical Practice"];
  return [9, 14, 16].map((hour, index): SandboxAppointmentSlot => ({
    id: `appointment-sandbox-${seed}-${index + 1}`,
    externalProviderId: `provider-${seed}-${index + 1}`,
    providerName: providers[index % providers.length],
    specialty,
    location,
    startsAt: `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endsAt: `${date}T${String(hour).padStart(2, "0")}:30:00.000Z`,
    timeZone,
    bookingMode: "sandbox"
  }));
}

function validateSlot(value: unknown): SandboxAppointmentSlot {
  if (!value || typeof value !== "object") throw badRequest("A complete sandbox appointment slot is required.");
  const slot = value as Partial<SandboxAppointmentSlot>;
  if (!String(slot.id ?? "").startsWith("appointment-sandbox-") || slot.bookingMode !== "sandbox") throw badRequest("Only sandbox appointment slots can be booked here.");
  const startsAt = new Date(String(slot.startsAt));
  const endsAt = new Date(String(slot.endsAt));
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || endsAt <= startsAt) throw badRequest("The appointment slot time is invalid.");
  return {
    id: String(slot.id), externalProviderId: requiredText(slot.externalProviderId, "Provider identifier"), providerName: requiredText(slot.providerName, "Provider name"),
    specialty: requiredText(slot.specialty, "Specialty"), location: requiredText(slot.location, "Location"), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    timeZone: requiredText(slot.timeZone ?? "UTC", "Time zone", 80), bookingMode: "sandbox"
  };
}

export async function listAppointments(userId: string) {
  const rows = await prisma.appointment.findMany({ where: { userId }, orderBy: { startsAt: "asc" } });
  return rows.map(serializeAppointment);
}

export async function bookSandboxAppointment(input: { userId: string; slot: unknown; confirmed: unknown; idempotencyKey: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit appointment booking confirmation is required.");
  const slot = validateSlot(input.slot);
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 200);
  const existing = await prisma.appointment.findUnique({ where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey } } });
  if (existing) return serializeAppointment(existing);
  const confirmationCode = `APPT-${createHash("sha256").update(`${input.userId}:${idempotencyKey}`).digest("hex").slice(0, 8).toUpperCase()}`;
  const created = await prisma.appointment.create({ data: { userId: input.userId, providerId: "appointment-sandbox", externalProviderId: slot.externalProviderId, providerName: slot.providerName, specialty: slot.specialty, location: slot.location, startsAt: slot.startsAt, endsAt: slot.endsAt, timeZone: slot.timeZone, status: "confirmed", confirmationCode, idempotencyKey } });
  return serializeAppointment(created);
}

async function ownedActiveAppointment(userId: string, id: string) {
  const appointment = await prisma.appointment.findFirst({ where: { id, userId } });
  if (!appointment) throw badRequest("Appointment not found.");
  if (appointment.status === "cancelled") throw badRequest("A cancelled appointment cannot be changed.");
  return appointment;
}

export async function rescheduleSandboxAppointment(input: { userId: string; id: string; slot: unknown; confirmed: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit rescheduling confirmation is required.");
  const current = await ownedActiveAppointment(input.userId, input.id);
  const slot = validateSlot(input.slot);
  const updated = await prisma.appointment.update({ where: { id: current.id }, data: { externalProviderId: slot.externalProviderId, providerName: slot.providerName, specialty: slot.specialty, location: slot.location, startsAt: slot.startsAt, endsAt: slot.endsAt, timeZone: slot.timeZone, status: "confirmed", calendarEventJson: "{}" } });
  return serializeAppointment(updated);
}

export async function cancelSandboxAppointment(input: { userId: string; id: string; confirmed: unknown }) {
  if (input.confirmed !== true) throw badRequest("Explicit appointment cancellation confirmation is required.");
  const current = await ownedActiveAppointment(input.userId, input.id);
  return serializeAppointment(await prisma.appointment.update({ where: { id: current.id }, data: { status: "cancelled" } }));
}

export async function syncAppointmentToCalendar(input: { userId: string; id: string }) {
  const appointment = await ownedActiveAppointment(input.userId, input.id);
  const prior = decodeJson<Record<string, unknown>>(appointment.calendarEventJson, {});
  if (Object.keys(prior).length) return { appointment: serializeAppointment(appointment), calendarEvent: prior, replayed: true };
  const calendar = await createCalendarEvent({ userId: input.userId, title: `${appointment.specialty} appointment`, start: appointment.startsAt.toISOString(), end: appointment.endsAt.toISOString(), timeZone: appointment.timeZone, location: appointment.location, description: `Sandbox appointment with ${appointment.providerName}. Confirmation: ${appointment.confirmationCode ?? "pending"}.` });
  if (calendar.status === "blocked") return { appointment: serializeAppointment(appointment), calendarEvent: null, replayed: false, blocked: true, reason: calendar.reason };
  const calendarEvent = { eventId: calendar.eventId, eventUrl: calendar.eventUrl, eventStatus: calendar.eventStatus };
  const updated = await prisma.appointment.update({ where: { id: appointment.id }, data: { calendarEventJson: encodeJson(calendarEvent) } });
  return { appointment: serializeAppointment(updated), calendarEvent, replayed: false };
}
