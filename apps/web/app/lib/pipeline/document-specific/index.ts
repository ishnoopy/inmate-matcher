/**
 * Document-Specific Extractors Index
 *
 * Each template type has its own extraction rules optimized for that document format.
 */

export { extractFromBookingSummary } from "./bookingSummary";
export { extractFromCourtDocketNotice } from "./courtDocketNotice";
export { extractFromVehicleCrashReport } from "./vehicleCrashReport";

export type { ExtractedPerson as BookingSummaryPerson } from "./bookingSummary";
export type { ExtractedPerson as CourtDocketNoticePerson } from "./courtDocketNotice";
export type { ExtractedPerson as VehicleCrashReportPerson } from "./vehicleCrashReport";
