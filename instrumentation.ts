import type { Instrumentation } from "next";
import {
  classifyPilotPath, pilotSeverity, pilotTraceId, recordPilotSignal,
} from "@/lib/observability/pilot";
import { deliverPilotP0Alert } from "@/lib/observability/p0-alert-mailer";

/** Next.js server-side uncaught-error hook; never serialize err or request body. */
export const onRequestError: Instrumentation.onRequestError = async (_err, request) => {
  const surface = classifyPilotPath(request.path);
  const signal = recordPilotSignal({
    traceId: pilotTraceId(),
    surface,
    severity: pilotSeverity(surface),
    outcome: "failed",
    code: "UNHANDLED_EXCEPTION",
    httpStatus: 500,
  });
  await deliverPilotP0Alert(signal);
};
