export const customerStatuses = [
  "lead",
  "prospect",
  "active",
  "paused",
  "archived"
] as const;

export type CustomerStatus = (typeof customerStatuses)[number];

export const activityTypes = [
  "note",
  "call",
  "email",
  "meeting",
  "task"
] as const;

export type ActivityType = (typeof activityTypes)[number];

export interface Customer {
  id: number;
  company: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  dealValueCents: number;
  nextFollowUp: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: number;
  customerId: number;
  type: ActivityType;
  summary: string;
  happenedAt: string;
  createdAt: string;
}

export interface CustomerWithActivities extends Customer {
  activities: Activity[];
}
