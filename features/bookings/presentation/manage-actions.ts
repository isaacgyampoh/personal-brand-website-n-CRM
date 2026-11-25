"use server";

import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/actions";
import { rateLimit } from "@/lib/security/rate-limit";
import { ipHash } from "@/lib/security/request";
import { appointmentByManageToken, cancelAppointment, rescheduleAppointment, BookingError } from "../application/booking";

async function resolve(token: string) {
  await rateLimit(`manage:${await ipHash()}`, 30, 600);
  const a = await appointmentByManageToken(z.string().max(64).parse(token));
  if (!a) throw new BookingError("This booking link is invalid.");
  return a;
}

export async function cancelByTokenAction(token: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const a = await resolve(token);
    await cancelAppointment(a.id, { kind: "customer" }, z.string().max(500).parse(reason || "Cancelled by customer"));
    return undefined;
  });
}

export async function rescheduleByTokenAction(token: string, startsAt: string): Promise<ActionResult> {
  return runAction(async () => {
    const a = await resolve(token);
    await rescheduleAppointment(a.id, z.string().datetime().parse(startsAt), { kind: "customer" });
    return undefined;
  });
}
